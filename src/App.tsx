import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { audienceLabel, type Visibility } from './mockData'
import { supabase } from './lib/supabase'

type Screen = 'home' | 'compose' | 'detail' | 'profile' | 'search' | 'settings'
type Theme = 'dark' | 'light' | 'system'
type ProfileTab = 'posts' | 'audio' | 'replies' | 'likes'
type PostKind = 'text' | 'audio' | 'text_audio'

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null; bio: string }
type PostProfile = { username: string; display_name: string | null; avatar_url: string | null }
type AudioAsset = { id: string; post_id: string; storage_bucket: string; storage_path: string; mime_type: string | null; duration_ms: number | null; size_bytes: number | null }
type SupabasePostRow = { id: string; text: string; visibility: Visibility; created_at: string; user_id: string; kind: PostKind | null; audio_assets?: AudioAsset[] }
type Post = SupabasePostRow & { audioAsset: AudioAsset | null }
type ProfileMap = Record<string, PostProfile>
type PostsStatus = 'idle' | 'loading' | 'loaded' | 'error'

const visibilityComposeLabel: Record<Visibility, string> = { followers: 'フォロワー', close_friends: '親しい友達', specific: 'カスタム', private: '自分のみ' }
const visibilityBadgeIcon: Record<Visibility, string> = { followers: '◉', close_friends: '◎', specific: '✦', private: '◐' }
const ShareIcon = () => <svg className="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="M8 11l8-5" /><path d="M8 13l8 5" /></svg>
// duration_ms は「録音時間の長さ(ms)」を保持する値。表示は mm:ss に統一する。
const MAX_COMPOSE_LENGTH = 140

const formatDuration = (ms: number | null | undefined) => {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '--:--'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

export function App() {
const [screen, setScreen] = useState<Screen>('home')
const [composeText, setComposeText] = useState('')
const [composeVisibility, setComposeVisibility] = useState<Visibility>('followers')
const [defaultVisibility, setDefaultVisibility] = useState<Visibility>('followers')
const [theme, setTheme] = useState<Theme>('light')
const [viewingProfileId, setViewingProfileId] = useState<string | null>(null)
const [savedPostIds, setSavedPostIds] = useState<string[]>([])
const [likedPostIds, setLikedPostIds] = useState<string[]>([])
const [profileTab, setProfileTab] = useState<ProfileTab>('posts')
const [session, setSession] = useState<Session | null>(null)
const [profile, setProfile] = useState<Profile | null>(null)
const [posts, setPosts] = useState<Post[]>([])
const [profileMap, setProfileMap] = useState<ProfileMap>({})
const [_selectedPostId, setSelectedPostId] = useState<string | null>(null)
const [errorMessage, setErrorMessage] = useState('')
const [postingStatusMessage, setPostingStatusMessage] = useState('')
const [deletingPostId, setDeletingPostId] = useState<string | null>(null)
const [postActionError, setPostActionError] = useState<Record<string, string>>({})
const [isPosting, setIsPosting] = useState(false)
const [postsStatus, setPostsStatus] = useState<PostsStatus>('idle')
const [postsError, setPostsError] = useState('')
const [initialAuthLoading, setInitialAuthLoading] = useState(true)
const [sessionRestoreError] = useState('')
const [recordingError, setRecordingError] = useState('')
const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
const [recordedUrl, setRecordedUrl] = useState<string>('')
const [recordedDurationMs, setRecordedDurationMs] = useState(0)
const [recordingSeconds, setRecordingSeconds] = useState(0)
const [isRecording, setIsRecording] = useState(false)
const [activeAudioPostId, setActiveAudioPostId] = useState<string | null>(null)
const [playingCurrentTimeSeconds, setPlayingCurrentTimeSeconds] = useState(0)
const [audioUrlMap, setAudioUrlMap] = useState<Record<string, string>>({})
const [audioLoadState, setAudioLoadState] = useState<Record<string, 'idle' | 'loading' | 'ready' | 'error'>>({})
const [audioLoadError, setAudioLoadError] = useState<Record<string, string>>({})
const isRestoringSessionRef = useRef(true)
const mediaRecorderRef = useRef<MediaRecorder | null>(null)
const mediaStreamRef = useRef<MediaStream | null>(null)
const chunksRef = useRef<BlobPart[]>([])
const recordingTimerRef = useRef<number | null>(null)
const recordingStartAtRef = useRef<number | null>(null)
const previewAudioRef = useRef<HTMLAudioElement | null>(null)
const playAudioRef = useRef<HTMLAudioElement | null>(null)

const resolvedTheme = theme === 'system' ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
const isRecordSupported = typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia


const toFriendlyError = (scope: 'permission' | 'storage_upload' | 'signed_url' | 'mic' | 'record_unsupported' | 'post_save' | 'audio_save' | 'delete' | 'fetch') => ({
  permission: '投稿の保存権限でエラーが発生しました。もう一度お試しください。',
  storage_upload: '音声のアップロードに失敗しました。通信状況を確認してください。',
  signed_url: '音声の再生準備に失敗しました。もう一度タップしてください。',
  mic: 'マイクの使用が許可されていません。ブラウザ設定から許可してください。',
  record_unsupported: 'このブラウザでは録音に対応していません。',
  post_save: '投稿の保存に失敗しました。しばらくしてから再試行してください。',
  audio_save: '音声情報の保存に失敗しました。もう一度投稿してください。',
  delete: '投稿の削除に失敗しました。もう一度お試しください。',
  fetch: '投稿の取得に失敗しました。時間をおいて再読み込みしてください。'
}[scope])


const stopRecorder = () => {
  if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
  recordingTimerRef.current = null
  mediaRecorderRef.current?.stop()
  mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
  mediaStreamRef.current = null
  setIsRecording(false)
}

const startRecording = async () => {
  if (!isRecordSupported) return setRecordingError(toFriendlyError('record_unsupported'))
  try {
    setRecordingError('')
    setRecordedBlob(null)
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    setRecordedUrl('')
    setRecordedDurationMs(0)
    setRecordingSeconds(0)
    recordingStartAtRef.current = Date.now()
    chunksRef.current = []
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStreamRef.current = stream
    const recorder = new MediaRecorder(stream)
    mediaRecorderRef.current = recorder
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      const url = URL.createObjectURL(blob)
      setRecordedBlob(blob)
      setRecordedUrl(url)
      const endAt = Date.now()
      const startAt = recordingStartAtRef.current ?? endAt
      const measuredDuration = Math.max(0, endAt - startAt)
      setRecordedDurationMs(measuredDuration)
    }
    recorder.start()
    setIsRecording(true)
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((prev) => {
        if (prev >= 60) {
          stopRecorder()
          return 60
        }
        return prev + 1
      })
    }, 1000)
  } catch (error) {
    console.error('microphone denied', error)
    setRecordingError(toFriendlyError('mic'))
  }
}

const toggleRecording = async () => { if (isRecording) stopRecorder(); else await startRecording() }

const clearRecordedAudio = () => {
  if (isRecording) stopRecorder()
  setRecordedBlob(null)
  setRecordedDurationMs(0)
  setRecordingSeconds(0)
  setRecordingError('')
  if (recordedUrl) URL.revokeObjectURL(recordedUrl)
  setRecordedUrl('')
  if (previewAudioRef.current) {
    previewAudioRef.current.pause()
    previewAudioRef.current.currentTime = 0
    previewAudioRef.current = null
  }
}

const handleClearRecordedAudio = () => {
  clearRecordedAudio()
}

const loadPosts = async () => {
  setPostsStatus('loading'); setPostsError('')
  const { data: postsData, error: postsErrorValue } = await supabase.from('posts').select('id,text,visibility,created_at,user_id,kind,audio_assets(id,post_id,storage_bucket,storage_path,mime_type,duration_ms,size_bytes)').order('created_at', { ascending: false }).limit(100)
  if (postsErrorValue) {
    setPosts([])
    setProfileMap({})
    setPostsStatus('error')
    setPostsError(toFriendlyError('fetch'))
    return
  }
  const loadedPosts = ((postsData ?? []) as SupabasePostRow[]).map((post) => ({ ...post, audioAsset: post.audio_assets?.[0] ?? null }))
  setPosts(loadedPosts)
  const userIds = Array.from(new Set(loadedPosts.map((post) => post.user_id).filter(Boolean)))
  if (userIds.length === 0) { setProfileMap({}); setPostsStatus('loaded'); return }
  const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', userIds)
  if (profilesError) {
    setProfileMap({})
    setPostsStatus('error')
    setPostsError(toFriendlyError('fetch'))
    return
  }
  setProfileMap((profilesData ?? []).reduce<ProfileMap>((acc, item) => { acc[item.id] = { username: item.username, display_name: item.display_name, avatar_url: item.avatar_url }; return acc }, {}))
  setPostsStatus('loaded')
}

const ensureProfile = async (activeSession: Session | null) => { /* unchanged */
  if (!activeSession?.user) return setProfile(null)
  const id = activeSession.user.id
  const metadata = activeSession.user.user_metadata ?? {}
  const emailLocalPart = activeSession.user.email?.split('@')[0] ?? 'user'
  const displayName = metadata.full_name ?? metadata.name ?? emailLocalPart
  const avatar = metadata.avatar_url ?? metadata.picture ?? null
  const username = `${emailLocalPart}_${id.replace(/-/g, '').slice(0, 6)}`
  const fallbackProfile: Profile = { id, username, display_name: displayName, avatar_url: avatar, bio: '' }
  await supabase.from('profiles').upsert(fallbackProfile, { onConflict: 'id' })
  const { data } = await supabase.from('profiles').select('id,username,display_name,avatar_url,bio').eq('id', id).single()
  setProfile(data ?? fallbackProfile)
}

useEffect(() => () => { stopRecorder(); if (recordedUrl) URL.revokeObjectURL(recordedUrl) }, [recordedUrl])
useEffect(() => { if (screen !== 'compose' && isRecording) stopRecorder() }, [screen, isRecording])
useEffect(() => { if (screen !== 'profile') setViewingProfileId(null) }, [screen])
useEffect(() => () => { playAudioRef.current?.pause() }, [])

useEffect(() => {
  const targetId = viewingProfileId
  if (!targetId || targetId === profile?.id || profileMap[targetId]) return
  let mounted = true
  void supabase.from('profiles').select('id,username,display_name,avatar_url,bio').eq('id', targetId).single().then(({ data }) => {
    if (!mounted || !data) return
    setProfileMap((prev) => ({ ...prev, [data.id]: { username: data.username, display_name: data.display_name, avatar_url: data.avatar_url } }))
  })
  return () => { mounted = false }
}, [viewingProfileId, profile?.id])
useEffect(() => {
  let isMounted = true
  const bootstrap = async () => { const { data } = await supabase.auth.getSession(); if (!isMounted) return; if (!data.session) { setInitialAuthLoading(false); isRestoringSessionRef.current = false; return } setSession(data.session); await ensureProfile(data.session); await loadPosts(); setInitialAuthLoading(false); isRestoringSessionRef.current = false }
  void bootstrap()
  const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => { if (!isMounted || isRestoringSessionRef.current) return; setSession(newSession); if (newSession) { await ensureProfile(newSession); await loadPosts() } })
  return () => { isMounted = false; listener.subscription.unsubscribe() }
}, [])

const activeProfileId = viewingProfileId ?? session?.user.id ?? null
const viewedProfile = activeProfileId ? (activeProfileId === profile?.id ? profile : (profileMap[activeProfileId] ? { id: activeProfileId, ...profileMap[activeProfileId], bio: '' } : null)) : null
const myPosts = useMemo(() => posts.filter((post) => post.user_id === activeProfileId), [posts, activeProfileId])
const profileName = profile?.display_name ?? 'friendcast user'
const formatDate = (value: string) => new Date(value).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
if (initialAuthLoading) return <div className={`app-shell theme-${resolvedTheme}`}>loading...</div>
if (!session) return <div className={`app-shell theme-${resolvedTheme}`}><main className="screen login-screen"><article className="login-card"><h1>friendcast</h1><p>親しい人にだけ届ける、声のタイムライン</p>{sessionRestoreError && <p className="status-message status-error">{sessionRestoreError}</p>}<button className="google-login-btn" onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}>Googleでログイン</button></article></main></div>

const withTimeout = async <T,>(promiseLike: PromiseLike<T>, timeoutMs = 15000): Promise<T> => {
  let timeoutId: number | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
  })
  try {
    return await Promise.race([Promise.resolve(promiseLike), timeoutPromise])
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)
  }
}

const handleCreatePost = async () => {
  const text = composeText.trim()
  if (isPosting) return
  if (!session?.user || (!text && !recordedBlob)) return
  setIsPosting(true); setErrorMessage(''); setPostingStatusMessage('投稿を準備中...')
  let storagePath: string | null = null
  let postId: string | null = null
  let shouldGoHome = false
  try {
  if (recordedBlob) {
    storagePath = `${session.user.id}/${Date.now()}.${(recordedBlob.type.split('/')[1] || 'webm').replace('x-', '')}`
    setPostingStatusMessage('音声をアップロード中...')
    const { error } = await withTimeout(supabase.storage.from('voice-posts').upload(storagePath, recordedBlob, { contentType: recordedBlob.type, upsert: false }))
    if (error) throw new Error('STORAGE_UPLOAD_FAILED')
  }
  const kind: PostKind = recordedBlob ? (text ? 'text_audio' : 'audio') : 'text'
  setPostingStatusMessage('投稿を保存中...')
  const { data: postData, error: postError } = await withTimeout(supabase.from('posts').insert({ user_id: session.user.id, text, visibility: composeVisibility || defaultVisibility, kind }).select('id').single())
  if (postError || !postData?.id) throw postError ?? new Error('POST_SAVE_FAILED')
  postId = postData.id
  if (recordedBlob && storagePath) {
    setPostingStatusMessage('音声情報を保存中...')
    // recordedDurationMs(録音実測ミリ秒)を audio_assets.duration_ms に保存する。
    const safeDurationMs = Number.isFinite(recordedDurationMs) && recordedDurationMs > 0 ? Math.round(recordedDurationMs) : null
    const { error: audioError } = await withTimeout(supabase.from('audio_assets').insert({ owner_id: session.user.id, post_id: postData.id, storage_bucket: 'voice-posts', storage_path: storagePath, mime_type: recordedBlob.type, duration_ms: safeDurationMs, size_bytes: recordedBlob.size }))
    if (audioError) throw audioError
  }
    shouldGoHome = true
  await loadPosts()
  } catch (error: any) {
    console.error('create post failed', error)
    if (postId) await supabase.from('posts').delete().eq('id', postId)
    if (storagePath) await supabase.storage.from('voice-posts').remove([storagePath])
    const message = String(error?.message ?? '')
    if (message.includes('TIMEOUT')) setErrorMessage('投稿処理がタイムアウトしました。通信状況を確認して再試行してください。')
    else if (message.toLowerCase().includes('permission')) setErrorMessage(toFriendlyError('permission'))
    else if (message.includes('STORAGE_UPLOAD_FAILED')) setErrorMessage(toFriendlyError('storage_upload'))
    else if (message.includes('audio_assets')) setErrorMessage(toFriendlyError('audio_save'))
    else setErrorMessage(toFriendlyError('post_save'))
  } finally {
    setIsPosting(false)
    setPostingStatusMessage('')
    if (shouldGoHome) {
      setComposeText(''); clearRecordedAudio(); setErrorMessage('')
      setScreen('home')
    }
  }
}


const isComposeScreen = screen === 'compose'
const showBottomNav = !isComposeScreen
const showGlobalFab = !isComposeScreen
const profilePostsToRender = profileTab === 'audio'
  ? myPosts.filter((post) => Boolean(post.audioAsset?.storage_path))
  : myPosts

const renderAudioPlayer = (post: Post) => {
  if (!post.audioAsset) return null
  const state = audioLoadState[post.id] ?? 'idle'
  const isPlaying = activeAudioPostId === post.id
  const totalDuration = formatDuration(post.audioAsset.duration_ms)
  const elapsedDuration = formatDuration(Math.max(0, Math.floor(playingCurrentTimeSeconds)) * 1000)
  const durationLabel = isPlaying ? `${elapsedDuration} / ${totalDuration}` : totalDuration
  const play = async () => {
    const asset = post.audioAsset
    if (!asset) return
    if (activeAudioPostId === post.id) {
      playAudioRef.current?.pause()
      setActiveAudioPostId(null)
      setPlayingCurrentTimeSeconds(0)
      return
    }
    setAudioLoadError((p) => ({ ...p, [post.id]: '' }))
    let url = audioUrlMap[post.id]
    if (!url) {
      setAudioLoadState((p) => ({ ...p, [post.id]: 'loading' }))
      const { data, error } = await supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 30)
      if (error || !data?.signedUrl) {
        setAudioLoadState((p) => ({ ...p, [post.id]: 'error' }))
        console.error('signed URL failed', error)
        setAudioLoadError((p) => ({ ...p, [post.id]: toFriendlyError('signed_url') }))
        return
      }
      url = data.signedUrl
      setAudioUrlMap((p) => ({ ...p, [post.id]: url! }))
      setAudioLoadState((p) => ({ ...p, [post.id]: 'ready' }))
    }
    playAudioRef.current?.pause()
    playAudioRef.current = new Audio(url)
    playAudioRef.current.currentTime = 0
    playAudioRef.current.ontimeupdate = () => {
      setPlayingCurrentTimeSeconds(playAudioRef.current?.currentTime ?? 0)
    }
    playAudioRef.current.onpause = () => {
      setActiveAudioPostId((current) => (current === post.id ? null : current))
      setPlayingCurrentTimeSeconds(0)
    }
    playAudioRef.current.onended = () => {
      setActiveAudioPostId(null)
      setPlayingCurrentTimeSeconds(0)
    }
    try {
      await playAudioRef.current.play()
      setActiveAudioPostId(post.id)
      setPlayingCurrentTimeSeconds(0)
    } catch (error) {
      console.error('audio play failed', error)
      setAudioLoadError((p) => ({ ...p, [post.id]: '再生できませんでした。もう一度タップしてください。' }))
      setActiveAudioPostId(null)
    }
  }
  return <div className={`audio-card ${isPlaying ? 'is-active' : ''}`}><button className="audio-play audio-play-button" type="button" onClick={play}><span className={`play-icon ${isPlaying ? 'is-stop' : ''}`}>{isPlaying ? '■' : '▷'}</span></button><div className={`audio-wave ${isPlaying ? 'playing' : ''}`}>{Array.from({ length: 18 }).map((_, i) => <i key={i} style={{ height: `${8 + ((i % 6) * 4)}px`, animationDelay: `${i * 0.05}s` }} />)}</div><span className="audio-duration">{durationLabel}</span>{isPlaying && <small className="audio-playing-label">再生中</small>}{state === 'loading' && <small>読み込み中...</small>}{audioLoadError[post.id] && <small className="status-error">{audioLoadError[post.id]}</small>}</div>
}

const getAvatarInitial = (name: string) => name.slice(0, 1).toUpperCase()
const goToProfile = (userId: string) => { setViewingProfileId(userId); setScreen('profile') }


const handleDeletePost = async (post: Post) => {
  if (!session?.user || post.user_id !== session.user.id) return
  const confirmed = window.confirm('この投稿を削除しますか？')
  if (!confirmed) return
  setDeletingPostId(post.id)
  setPostActionError((prev) => ({ ...prev, [post.id]: '' }))
  try {
    if (post.audioAsset?.storage_path) {
      const { error: storageError } = await supabase.storage.from(post.audioAsset.storage_bucket).remove([post.audioAsset.storage_path])
      if (storageError) console.error('storage delete failed', storageError)
      const { error: assetError } = await supabase.from('audio_assets').delete().eq('post_id', post.id).eq('owner_id', session.user.id)
      if (assetError) console.error('audio_assets delete failed', assetError)
    }
    const { error: postDeleteError } = await supabase.from('posts').delete().eq('id', post.id).eq('user_id', session.user.id)
    if (postDeleteError) throw postDeleteError
    await loadPosts()
  } catch (error) {
    console.error('post delete failed', error)
    setPostActionError((prev) => ({ ...prev, [post.id]: toFriendlyError('delete') }))
  } finally {
    setDeletingPostId(null)
  }
}

const resolvePostAuthor = (post: Post): PostProfile | null => profileMap[post.user_id] ?? null
const renderTimelinePost = (post: Post, compact = false) => { const authorProfile = resolvePostAuthor(post); const isOwnPost = post.user_id === session?.user.id && activeProfileId === session?.user.id; const displayName = authorProfile?.display_name ?? authorProfile?.username ?? 'friendcast user'; const handle = authorProfile?.username ? `@${authorProfile.username}` : '@user'; return <article key={post.id} className="tweet-item" role="article"><button className="tweet-avatar" onClick={() => goToProfile(post.user_id)} style={authorProfile?.avatar_url ? { backgroundImage: `url(${authorProfile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{displayName.slice(0, 1)}</button><div className="tweet-content"><div className="tweet-header-row"><button className="tweet-header author-link" onClick={() => goToProfile(post.user_id)} type="button"><div className="author-primary"><strong>{displayName}</strong></div><span className="author-handle">{handle}</span><time className="author-time">{formatDate(post.created_at)}</time></button><div className="tweet-header-actions"><div className="visibility-badge"><span>{visibilityBadgeIcon[post.visibility]}</span><span>{visibilityComposeLabel[post.visibility]}</span></div>{isOwnPost && <button className="post-delete-btn" aria-label="投稿を削除" disabled={deletingPostId === post.id} onClick={() => void handleDeletePost(post)}>{deletingPostId === post.id ? '…' : '🗑'}</button>}</div></div><p className="tweet-text">{post.text}</p>{renderAudioPlayer(post)}{postActionError[post.id] && <p className="inline-error">{postActionError[post.id]}</p>}{!compact && <div className="delivery-inline"><small>{audienceLabel[post.visibility]}に届きます</small></div>}<div className="action-row"><button className="icon-btn" onClick={() => { setSelectedPostId(post.id); setScreen('detail') }}>💬 <span>0</span></button><button className="icon-btn">🔁 <span>0</span></button><button className={`icon-btn ${likedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setLikedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}>♡ <span>{likedPostIds.includes(post.id) ? 1 : 0}</span></button><button className={`icon-btn ${savedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setSavedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}><ShareIcon /></button></div></div></article> }

return <div className={`app-shell theme-${resolvedTheme}`}><main className="screen">{screen === 'home' && <section className="screen-home"><header className="home-mobile-header"><button className="mini-avatar" onClick={() => { setViewingProfileId(session.user.id); setScreen('profile') }} style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(profileName)}</button><h1>friendcast</h1><span className="header-spacer" /></header>{postsStatus === 'error' && <p className="status-message status-error">{postsError}</p>}{posts.length === 0 && postsStatus !== 'loading' && <p className="status-message">投稿はまだありません</p>}<div className="timeline-list">{posts.map((post) => renderTimelinePost(post))}</div></section>}{screen === 'profile' && <section className="profile-screen">{activeProfileId === session.user.id ? <button className="profile-edit-btn">プロフィールを編集</button> : <button className="profile-edit-btn">フォロー</button>}<h3>{viewedProfile?.display_name ?? 'friendcast user'}</h3><p>{viewedProfile?.username ? `@${viewedProfile.username}` : '@user'}</p><p>{viewedProfile?.bio || '自己紹介はまだありません。'}</p><div className="tabs profile-tabs"><button className={profileTab === 'posts' ? 'active-tab' : ''} onClick={() => setProfileTab('posts')}>投稿</button><button className={profileTab === 'audio' ? 'active-tab' : ''} onClick={() => setProfileTab('audio')}>ボイス</button></div><div className="timeline-list">{profilePostsToRender.map((post) => renderTimelinePost(post, true))}</div></section>}{screen === 'search' && <section className="search-screen"><article className="search-panel"><h2>検索</h2><h3>ボイスログ検索（MVP）</h3><input placeholder="キーワードで検索" disabled /><p className="status-message">検索UIはMVP調整中です。下部ナビから他画面へ移動できます。</p></article></section>}{screen === 'settings' && <section className="search-screen"><article className="search-panel"><h2>設定</h2><h3>テーマ</h3><div className="tabs"><button className={theme === 'light' ? 'active-tab' : ''} onClick={() => setTheme('light')}>ライト</button><button className={theme === 'dark' ? 'active-tab' : ''} onClick={() => setTheme('dark')}>ダーク</button></div><h3>公開範囲の初期設定</h3><div className="visibility-grid">{(['followers','close_friends','specific','private'] as Visibility[]).map((v) => <button key={v} className={`visibility-item ${defaultVisibility === v ? 'selected' : ''}`} onClick={() => setDefaultVisibility(v)}>{visibilityComposeLabel[v]}</button>)}</div><p className="status-message">自分のテスト投稿は、ホーム/プロフィールの各投稿から削除できます。</p><button className="logout-btn" onClick={() => supabase.auth.signOut()}>ログアウト</button></article></section>}{screen === 'compose' && <section className="compose-screen"><div className="compose-topbar"><button className="mini-avatar" onClick={() => { setViewingProfileId(session.user.id); setScreen('profile') }} style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(profileName)}</button><button className="compose-cancel" onClick={() => setScreen('home')}>キャンセル</button></div><textarea maxLength={MAX_COMPOSE_LENGTH} value={composeText} onChange={(e)=>setComposeText(e.target.value.slice(0, MAX_COMPOSE_LENGTH))} placeholder="いまどうしてる？" className="compose-textarea" /><p className={`compose-counter ${composeText.length >= MAX_COMPOSE_LENGTH ? 'is-limit' : composeText.length >= 120 ? 'is-near-limit' : ''}`}>{composeText.length} / {MAX_COMPOSE_LENGTH}</p><article className="record-card"><div className={`record-waveform ${isRecording ? 'live' : ''}`}>{Array.from({ length: 12 }).map((_, i) => <span key={i} className="record-bar" style={{ animationDelay: `${i * 0.06}s` }} />)}</div><button className={`record-fab ${isRecording ? 'recording' : ''}`} onClick={toggleRecording} type="button">🎙</button><p>{isRecording ? '録音中... タップして停止' : 'タップして録音を開始'}</p><p>{isRecording ? formatDuration(recordingSeconds * 1000) : (recordedBlob ? `録音時間 ${formatDuration(recordedDurationMs)}` : '未録音')}</p>{recordedBlob && <div className="audio-preview"><button type="button" className="voice-play-button" onClick={() => { if (!previewAudioRef.current && recordedUrl) previewAudioRef.current = new Audio(recordedUrl); void previewAudioRef.current?.play() }}><span className="play-icon">▷</span><span>再生確認</span></button><button type="button" onClick={handleClearRecordedAudio}>削除</button><span>録音済み</span><span>録音時間 {formatDuration(recordedDurationMs)}</span></div>}{recordingError && <p className="compose-error-message">{recordingError}</p>}{!isRecordSupported && <p className="compose-error-message">このブラウザでは録音に対応していません</p>}</article><div className="compose-visibility-area"><p className="compose-visibility-label">公開範囲</p><div className="visibility-grid compose-visibility-grid">{(['followers','close_friends','specific','private'] as Visibility[]).map((v) => <button key={v} className={`compose-visibility-item ${composeVisibility === v ? 'selected' : ''}`} onClick={() => setComposeVisibility(v)}><span className="visibility-left"><span className="visibility-icon">{visibilityBadgeIcon[v]}</span><span><strong>{visibilityComposeLabel[v]}</strong><small>{audienceLabel[v]}</small></span></span></button>)}</div></div><div className="compose-sticky-action"><button className="compose-post-btn" disabled={(!composeText.trim() && !recordedBlob) || isPosting} onClick={handleCreatePost}>{isPosting ? '投稿中...' : '投稿する'}</button>{postingStatusMessage && <p className="compose-status-message">{postingStatusMessage}</p>}{errorMessage && <p className="compose-error-message">{errorMessage}</p>}</div></section>}</main>{showBottomNav && <nav className="bottom-nav" aria-label="メインナビ"><button className={screen === 'home' ? 'nav-active' : ''} onClick={() => setScreen('home')}><span>🏠</span><small>ホーム</small></button><button className={screen === 'search' ? 'nav-active' : ''} onClick={() => setScreen('search')}><span>🔎</span><small>検索</small></button><button onClick={() => setScreen('compose')}><span>➕</span><small>投稿</small></button><button className={screen === 'profile' ? 'nav-active' : ''} onClick={() => setScreen('profile')}><span>👤</span><small>プロフ</small></button><button className={screen === 'settings' ? 'nav-active' : ''} onClick={() => setScreen('settings')}><span>⚙️</span><small>設定</small></button></nav>}{showGlobalFab && <button className="fab global-fab" onClick={() => setScreen('compose')}>🎙</button>}</div>
}
