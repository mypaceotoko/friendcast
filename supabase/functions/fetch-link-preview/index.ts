declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const MAX_URL_LENGTH = 2048
const FETCH_TIMEOUT_MS = 7000
const MAX_HTML_BYTES = 512 * 1024
const MAX_REDIRECTS = 3
const USER_AGENT = 'FriendcastLinkPreviewBot/1.0 (+https://friendcast.app)'

type LinkPreviewResponse = {
  url: string
  domain: string
  title: string
  description: string
  image: string | null
  siteName: string
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
})

const normalizeHostname = (hostname: string) => hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')

const isPrivateIPv4 = (hostname: string) => {
  const parts = hostname.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

const isBlockedHostname = (hostname: string) => {
  const normalized = normalizeHostname(hostname)
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized.endsWith('.localhost') ||
    isPrivateIPv4(normalized)
  )
}

const validatePreviewUrl = (rawUrl: unknown) => {
  if (typeof rawUrl !== 'string') throw new Error('url must be a string')
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl || trimmedUrl.length > MAX_URL_LENGTH) throw new Error('url length is invalid')

  let url: URL
  try {
    url = new URL(trimmedUrl)
  } catch {
    throw new Error('url is invalid')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http and https URLs are allowed')
  if (isBlockedHostname(url.hostname)) throw new Error('local and private network URLs are not allowed')
  url.hash = ''
  return url
}

const decodeHtmlEntities = (value: string) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))

const cleanText = (value: string | null | undefined) => decodeHtmlEntities(value ?? '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 500)

const getMetaContent = (html: string, attribute: 'property' | 'name', key: string) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escapedKey}["'])(?=[^>]*\\bcontent=["']([^"']*)["'])[^>]*>`, 'i'),
    new RegExp(`<meta\\b(?=[^>]*\\bcontent=["']([^"']*)["'])(?=[^>]*\\b${attribute}=["']${escapedKey}["'])[^>]*>`, 'i')
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return cleanText(match[1])
  }
  return ''
}

const getTitleTag = (html: string) => cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')

const getYouTubeVideoId = (url: URL) => {
  const host = normalizeHostname(url.hostname).replace(/^www\./, '')
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] ?? ''
  if (host === 'youtube.com' || host === 'm.youtube.com') return url.searchParams.get('v') ?? ''
  return ''
}

const resolveImageUrl = (image: string, baseUrl: URL) => {
  if (!image) return null
  try {
    const imageUrl = new URL(image, baseUrl)
    if (imageUrl.protocol !== 'http:' && imageUrl.protocol !== 'https:') return null
    if (isBlockedHostname(imageUrl.hostname)) return null
    return imageUrl.toString()
  } catch {
    return null
  }
}

const fallbackPreview = (url: URL): LinkPreviewResponse => {
  const domain = normalizeHostname(url.hostname).replace(/^www\./, '')
  const youtubeId = getYouTubeVideoId(url)
  return {
    url: url.toString(),
    domain,
    title: domain,
    description: '',
    image: youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null,
    siteName: domain
  }
}

const readLimitedText = async (response: Response) => {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    totalBytes += value.byteLength
    if (totalBytes > MAX_HTML_BYTES) {
      chunks.push(value.slice(0, Math.max(0, value.byteLength - (totalBytes - MAX_HTML_BYTES))))
      await reader.cancel()
      break
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

const fetchHtmlWithRedirects = async (initialUrl: URL) => {
  let currentUrl = initialUrl
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetch(currentUrl.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': USER_AGENT
        }
      })

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        if (!location || redirectCount === MAX_REDIRECTS) throw new Error('redirect limit exceeded')
        currentUrl = validatePreviewUrl(new URL(location, currentUrl).toString())
        continue
      }

      if (!response.ok) throw new Error(`fetch failed with status ${response.status}`)
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType && !contentType.toLowerCase().includes('text/html')) throw new Error('response is not HTML')
      return { html: await readLimitedText(response), finalUrl: currentUrl }
    }
    throw new Error('redirect limit exceeded')
  } finally {
    clearTimeout(timeoutId)
  }
}

const extractPreview = (html: string, finalUrl: URL, requestedUrl: URL): LinkPreviewResponse => {
  const domain = normalizeHostname(finalUrl.hostname).replace(/^www\./, '')
  const youtubeId = getYouTubeVideoId(finalUrl) || getYouTubeVideoId(requestedUrl)
  const ogImage = getMetaContent(html, 'property', 'og:image') || getMetaContent(html, 'name', 'twitter:image')
  const image = resolveImageUrl(ogImage, finalUrl) ?? (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null)

  return {
    url: requestedUrl.toString(),
    domain: normalizeHostname(requestedUrl.hostname).replace(/^www\./, '') || domain,
    title: getMetaContent(html, 'property', 'og:title') || getMetaContent(html, 'name', 'twitter:title') || getTitleTag(html) || domain,
    description: getMetaContent(html, 'property', 'og:description') || getMetaContent(html, 'name', 'twitter:description') || getMetaContent(html, 'name', 'description') || '',
    image,
    siteName: getMetaContent(html, 'property', 'og:site_name') || domain
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let url: URL
  try {
    const body = await request.json()
    url = validatePreviewUrl(body?.url)
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid request' }, 400)
  }

  try {
    const { html, finalUrl } = await fetchHtmlWithRedirects(url)
    return jsonResponse(extractPreview(html, finalUrl, url))
  } catch (error) {
    console.warn('Failed to fetch link preview', { url: url.toString(), error })
    return jsonResponse(fallbackPreview(url))
  }
})
