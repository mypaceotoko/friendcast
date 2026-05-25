import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { audienceLabel, type Visibility } from './mockData'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Screen = 'home' | 'compose' | 'detail' | 'profile' | 'search' | 'settings'
type Theme = 'dark' | 'light' | 'system'
type ProfileTab = 'posts' | 'audio' | 'replies' | 'likes'
type PostKind = 'text' | 'audio' | 'text_audio'

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null; bio: string }
type PostProfile = { username: string; display_name: string | null; avatar_url: string | null; bio: string }
type CommentRow = { id: string; post_id: string; user_id: string; body: string; created_at: string }
type CommentProfileMap = Record<string, PostProfile>
type AudioAsset = { id: string; post_id: string; storage_bucket: string; storage_path: string; mime_type: string | null; duration_ms: number | null; size_bytes: number | null }
type SupabasePostRow = { id: string; text: string; visibility: Visibility; created_at: string; user_id: string; kind: PostKind | null; audio_assets?: AudioAsset[] }
type Post = SupabasePostRow & { audioAsset: AudioAsset | null }
type TimelineItem = { type: 'post'; post: Post; created_at: string } | { type: 'repost'; post: Post; repostedBy: Profile; reposted_at: string; created_at: string }
type ProfileMap = Record<string, PostProfile>
type PostsStatus = 'idle' | 'loading' | 'loaded' | 'error'
type DiscoverStatus = 'idle' | 'loading' | 'loaded' | 'error'
type ProfileEditForm = { display_name: string; username: string; bio: string; avatar_url: string }

const visibilityComposeLabel: Record<Visibility, string> = { followers: 'フォロワー', close_friends: '親しい友達', specific: 'カスタム', private: '自分のみ' }
const visibilityBadgeIcon: Record<Visibility, string> = { followers: '◉', close_friends: '◎', specific: '✦', private: '◐' }
const ShareIcon = () => <svg className="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="M8 11l8-5" /><path d="M8 13l8 5" /></svg>
// duration_ms は「録音時間の長さ(ms)」を保持する値。表示は mm:ss に統一する。
const MAX_COMPOSE_LENGTH = 140
const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024

const formatDuration = (ms: number | null | undefined) => {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '--:--'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

const safeScrollToTop = () => {
  if (typeof window === 'undefined') return
  window.scrollTo(0, 0)
}

const getAuthRedirectUrl = () => {
  if (typeof window === 'undefined') return undefined
  if (!window.location?.origin) return undefined
  try {
    return new URL('/', window.location.origin).toString()
  } catch {
    return undefined
  }
}

export function App() {
const [screen, setScreen] = useState<Screen>('home')
const [composeText, setComposeText] = useState('')
const [composeVisibility, setComposeVisibility] = useState<Visibility>('followers')
const [defaultVisibility, setDefaultVisibility] = useState<Visibility>('followers')
const [theme, setTheme] = useState<Theme>('light')
const [viewingProfileId, setViewingProfileId] = useState<string | null>(null)
const [savedPostIds, setSavedPostIds] = useState<string[]>([])
const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set())
const [likesCountMap, setLikesCountMap] = useState<Record<string, number>>({})
const [likePendingPostIds, setLikePendingPostIds] = useState<Set<string>>(new Set())

const [repostedPostIds, setRepostedPostIds] = useState<Set<string>>(new Set())
const [repostsCountMap, setRepostsCountMap] = useState<Record<string, number>>({})
const [repostPendingPostIds, setRepostPendingPostIds] = useState<Set<string>>(new Set())
const [profileTab, setProfileTab] = useState<ProfileTab>('posts')
const [session, setSession] = useState<Session | null>(null)
const [profile, setProfile] = useState<Profile | null>(null)
const [posts, setPosts] = useState<Post[]>([])
const [profileMap, setProfileMap] = useState<ProfileMap>({})
const [errorMessage, setErrorMessage] = useState('')
const [postingStatusMessage, setPostingStatusMessage] = useState('')
const [deletingPostId, setDeletingPostId] = useState<string | null>(null)
const [postActionError, setPostActionError] = useState<Record<string, string>>({})
const [isPosting, setIsPosting] = useState(false)
const [postsStatus, setPostsStatus] = useState<PostsStatus>('idle')
const [postsError, setPostsError] = useState('')
const [initialAuthLoading, setInitialAuthLoading] = useState(true)
const [sessionRestoreError, setSessionRestoreError] = useState('')
const [recordingError, setRecordingError] = useState('')
const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
const [recordedUrl, setRecordedUrl] = useState<string>('')
const [recordedDurationMs, setRecordedDurationMs] = useState(0)
const [recordingSeconds, setRecordingSeconds] = useState(0)
const [isRecording, setIsRecording] = useState(false)
const [activeAudioPostId, setActiveAudioPostId] = useState<string | null>(null)
const [playingCurrentTimeSeconds, setPlayingCurrentTimeSeconds] = useState(0)
const [audioCurrentTimeMap, setAudioCurrentTimeMap] = useState<Record<string, number>>({})
const [audioDurationMap, setAudioDurationMap] = useState<Record<string, number>>({})
const [audioUrlMap, setAudioUrlMap] = useState<Record<string, string>>({})
const [audioLoadState, setAudioLoadState] = useState<Record<string, 'idle' | 'loading' | 'ready' | 'error'>>({})
const [audioLoadError, setAudioLoadError] = useState<Record<string, string>>({})
const [closeFriendIds, setCloseFriendIds] = useState<Set<string>>(new Set())
const [incomingCloseFriendOwnerIds, setIncomingCloseFriendOwnerIds] = useState<Set<string>>(new Set())
const [incomingCustomPostIds, setIncomingCustomPostIds] = useState<Set<string>>(new Set())
const [selectedCustomRecipientIds, setSelectedCustomRecipientIds] = useState<Set<string>>(new Set())
const [customRecipientError, setCustomRecipientError] = useState('')
const [closeFriendsPendingIds, setCloseFriendsPendingIds] = useState<Set<string>>(new Set())
const [closeFriendsError, setCloseFriendsError] = useState('')
const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
const [followPendingIds, setFollowPendingIds] = useState<Set<string>>(new Set())
const [followActionError, setFollowActionError] = useState('')
const [discoverUsers, setDiscoverUsers] = useState<Profile[]>([])
const [discoverStatus, setDiscoverStatus] = useState<DiscoverStatus>('idle')
const [discoverError, setDiscoverError] = useState('')
const [commentsCountMap, setCommentsCountMap] = useState<Record<string, number>>({})
const [openedCommentsPostId, setOpenedCommentsPostId] = useState<string | null>(null)
const [commentsByPostId, setCommentsByPostId] = useState<Record<string, CommentRow[]>>({})
const [homeRepostItems, setHomeRepostItems] = useState<TimelineItem[]>([])
const [commentProfileMap, setCommentProfileMap] = useState<CommentProfileMap>({})
const [commentsLoadingMap, setCommentsLoadingMap] = useState<Record<string, boolean>>({})
const [commentsErrorMap, setCommentsErrorMap] = useState<Record<string, string>>({})
const [commentInputMap, setCommentInputMap] = useState<Record<string, string>>({})
const [commentPostingMap, setCommentPostingMap] = useState<Record<string, boolean>>({})
const [commentDeletingMap, setCommentDeletingMap] = useState<Record<string, boolean>>({})
const [isEditingProfile, setIsEditingProfile] = useState(false)
const [profileEditForm, setProfileEditForm] = useState<ProfileEditForm>({ display_name: '', username: '', bio: '', avatar_url: '' })
const [profileEditErrors, setProfileEditErrors] = useState<Partial<Record<keyof ProfileEditForm, string>>>({})
const [profileEditMessage, setProfileEditMessage] = useState('')
const [isSavingProfile, setIsSavingProfile] = useState(false)
const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null)
const [selectedAvatarPreviewUrl, setSelectedAvatarPreviewUrl] = useState('')
const isRestoringSessionRef = useRef(true)
const INIT_TIMEOUT_MS = 8000
const mediaRecorderRef = useRef<MediaRecorder | null>(null)
const mediaStreamRef = useRef<MediaStream | null>(null)
const chunksRef = useRef<BlobPart[]>([])
const recordingTimerRef = useRef<number | null>(null)
const recordingStartAtRef = useRef<number | null>(null)
const previewAudioRef = useRef<HTMLAudioElement | null>(null)
const playAudioRef = useRef<HTMLAudioElement | null>(null)
const composeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
const lastProfileScrollKeyRef = useRef<string>('')

const resolvedTheme = theme === 'system' ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
const isRecordSupported = typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia
const sb = supabase



const toFriendlyError = (scope: 'permission' | 'storage_upload' | 'signed_url' | 'mic' | 'record_unsupported' | 'post_save' | 'audio_save' | 'delete' | 'fetch' | 'comment_fetch' | 'comment_post' | 'comment_delete' | 'like_toggle' | 'repost_toggle') => ({
  permission: '投稿の保存権限でエラーが発生しました。もう一度お試しください。',
  storage_upload: '音声のアップロードに失敗しました。通信状況を確認してください。',
  signed_url: '音声の再生準備に失敗しました。もう一度タップしてください。',
  mic: 'マイクの使用が許可されていません。ブラウザ設定から許可してください。',
  record_unsupported: 'このブラウザでは録音に対応していません。',
  post_save: '投稿の保存に失敗しました。しばらくしてから再試行してください。',
  audio_save: '音声情報の保存に失敗しました。もう一度投稿してください。',
  delete: '投稿の削除に失敗しました。もう一度お試しください。',
  fetch: '投稿の取得に失敗しました。時間をおいて再読み込みしてください。',
  comment_fetch: 'コメントの取得に失敗しました。時間をおいて再試行してください。',
  comment_post: 'コメントの投稿に失敗しました。もう一度お試しください。',
  comment_delete: 'コメントの削除に失敗しました。もう一度お試しください。',
  like_toggle: 'いいね操作に失敗しました。もう一度お試しください。',
  repost_toggle: 'リポスト操作に失敗しました。もう一度お試しください。'
}[scope])

const toFollowError = () => 'フォロー操作に失敗しました。時間をおいて再試行してください。'
const toDiscoverError = () => 'ユーザー一覧の取得に失敗しました。時間をおいて再試行してください。'
const toCloseFriendsError = () => '親しい友達の操作に失敗しました。時間をおいて再試行してください。'

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
  const { data: postsData, error: postsErrorValue } = await sb!.from('posts').select('id,text,visibility,created_at,user_id,kind,audio_assets(id,post_id,storage_bucket,storage_path,mime_type,duration_ms,size_bytes)').order('created_at', { ascending: false }).limit(100)
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
  const { data: profilesData, error: profilesError } = await sb!.from('profiles').select('id,username,display_name,avatar_url,bio').in('id', userIds)
  if (profilesError) {
    setProfileMap({})
    setPostsStatus('error')
    setPostsError(toFriendlyError('fetch'))
    return
  }
  setProfileMap((profilesData ?? []).reduce<ProfileMap>((acc, item) => { acc[item.id] = { username: item.username, display_name: item.display_name, avatar_url: item.avatar_url, bio: item.bio ?? '' }; return acc }, {}))
  setPostsStatus('loaded')
}

const loadFollowing = async (userId: string) => {
  const { data, error } = await sb!.from('follows').select('following_id').eq('follower_id', userId)
  if (error) {
    console.error('load following failed', error)
    setFollowActionError(toFollowError())
    return
  }
  setFollowingIds(new Set((data ?? []).map((row) => row.following_id).filter(Boolean)))
}

const loadCommentsCount = async (postIds: string[]) => {
  if (!postIds.length) return
  const { data, error } = await sb!.from('comments').select('post_id').in('post_id', postIds)
  if (error) {
    console.error('comment count fetch failed', error)
    return
  }
  const nextMap = postIds.reduce<Record<string, number>>((acc, postId) => { acc[postId] = 0; return acc }, {})
  for (const item of data ?? []) {
    if (item.post_id) nextMap[item.post_id] = (nextMap[item.post_id] ?? 0) + 1
  }
  setCommentsCountMap((prev) => ({ ...prev, ...nextMap }))
}

const loadLikesForPosts = async (postIds: string[], userId: string) => {
  if (!postIds.length) {
    setLikesCountMap({})
    setLikedPostIds(new Set())
    return
  }
  const { data, error } = await sb!.from('post_likes').select('post_id,user_id').in('post_id', postIds)
  if (error) {
    console.error('likes fetch failed', error)
    return
  }
  const nextCountMap = postIds.reduce<Record<string, number>>((acc, postId) => { acc[postId] = 0; return acc }, {})
  const nextLikedIds = new Set<string>()
  for (const row of data ?? []) {
    if (row.post_id) nextCountMap[row.post_id] = (nextCountMap[row.post_id] ?? 0) + 1
    if (row.user_id === userId && row.post_id) nextLikedIds.add(row.post_id)
  }
  setLikesCountMap(nextCountMap)
  setLikedPostIds(nextLikedIds)
}


const loadRepostsForPosts = async (postIds: string[], userId: string) => {
  if (!postIds.length) {
    setRepostsCountMap({})
    setRepostedPostIds(new Set())
    return
  }
  const { data, error } = await sb!.from('post_reposts').select('post_id,user_id').in('post_id', postIds)
  if (error) {
    console.error('reposts fetch failed', error)
    return
  }
  const nextCountMap = postIds.reduce<Record<string, number>>((acc, postId) => { acc[postId] = 0; return acc }, {})
  const nextRepostedIds = new Set<string>()
  for (const row of data ?? []) {
    if (row.post_id) nextCountMap[row.post_id] = (nextCountMap[row.post_id] ?? 0) + 1
    if (row.user_id === userId && row.post_id) nextRepostedIds.add(row.post_id)
  }
  setRepostsCountMap(nextCountMap)
  setRepostedPostIds(nextRepostedIds)
}

const loadHomeRepostItems = async (viewerId: string, targetUserIds: string[]) => {
  if (!targetUserIds.length) { setHomeRepostItems([]); return }
  const { data: repostRows, error: repostError } = await sb!.from('post_reposts').select('post_id,user_id,created_at').in('user_id', targetUserIds).order('created_at', { ascending: false }).limit(200)
  if (repostError) {
    console.error('home repost fetch failed', repostError)
    setHomeRepostItems([])
    return
  }
  const validRows = (repostRows ?? []).filter((row) => row.post_id && row.user_id && row.created_at)
  if (!validRows.length) { setHomeRepostItems([]); return }
  const repostPostIds = Array.from(new Set(validRows.map((row) => row.post_id)))
  const { data: repostPostsData, error: repostPostsError } = await sb!.from('posts').select('id,text,visibility,created_at,user_id,kind,audio_assets(id,post_id,storage_bucket,storage_path,mime_type,duration_ms,size_bytes)').in('id', repostPostIds)
  if (repostPostsError) {
    console.error('repost source posts fetch failed', repostPostsError)
    setHomeRepostItems([])
    return
  }
  const repostPosts = ((repostPostsData ?? []) as SupabasePostRow[]).map((post) => ({ ...post, audioAsset: post.audio_assets?.[0] ?? null }))
  const repostPostMap = new Map(repostPosts.map((post) => [post.id, post]))
  const repostUserIds = Array.from(new Set(validRows.map((row) => row.user_id)))
  const repostAuthorIds = Array.from(new Set(repostPosts.map((post) => post.user_id)))
  const profileIds = Array.from(new Set([...repostUserIds, ...repostAuthorIds]))
  const { data: repostProfilesData, error: repostProfilesError } = await sb!.from('profiles').select('id,username,display_name,avatar_url,bio').in('id', profileIds)
  if (repostProfilesError) {
    console.error('repost profiles fetch failed', repostProfilesError)
    setHomeRepostItems([])
    return
  }
  const repostProfiles = new Map((repostProfilesData ?? []).map((item) => [item.id, item as Profile]))
  const repostActorProfiles = new Map(validRows.map((row) => [row.user_id, repostProfiles.get(row.user_id)]))
  const items: TimelineItem[] = []
  for (const row of validRows) {
    const post = repostPostMap.get(row.post_id)
    const repostedBy = repostActorProfiles.get(row.user_id)
    if (!post || !repostedBy) continue
    if (!canViewPost(post, viewerId)) continue
    items.push({ type: 'repost', post, repostedBy, reposted_at: row.created_at, created_at: row.created_at })
  }
  setHomeRepostItems(items)
  setProfileMap((prev) => {
    const next = { ...prev }
    for (const item of repostProfiles.values()) {
      next[item.id] = { username: item.username, display_name: item.display_name, avatar_url: item.avatar_url, bio: item.bio ?? '' }
    }
    return next
  })
}

const loadCommentsForPost = async (postId: string) => {
  setCommentsLoadingMap((prev) => ({ ...prev, [postId]: true }))
  setCommentsErrorMap((prev) => ({ ...prev, [postId]: '' }))
  try {
    const { data, error } = await sb!.from('comments').select('id,post_id,user_id,body,created_at').eq('post_id', postId).order('created_at', { ascending: true })
    if (error) throw error
    const comments = (data ?? []) as CommentRow[]
    setCommentsByPostId((prev) => ({ ...prev, [postId]: comments }))
    const commenterIds = Array.from(new Set(comments.map((comment) => comment.user_id).filter(Boolean)))
    if (commenterIds.length > 0) {
      const { data: profileData, error: profileError } = await sb!.from('profiles').select('id,username,display_name,avatar_url,bio').in('id', commenterIds)
      if (profileError) throw profileError
      const loadedMap = (profileData ?? []).reduce<CommentProfileMap>((acc, item) => {
        acc[item.id] = { username: item.username, display_name: item.display_name, avatar_url: item.avatar_url, bio: item.bio ?? '' }
        return acc
      }, {})
      setCommentProfileMap((prev) => ({ ...prev, ...loadedMap }))
    }
  } catch (error) {
    console.error('comment load failed', error)
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: toFriendlyError('comment_fetch') }))
  } finally {
    setCommentsLoadingMap((prev) => ({ ...prev, [postId]: false }))
  }
}

const loadCloseFriends = async (userId: string) => {
  const [{ data: ownedData, error: ownedError }, { data: incomingData, error: incomingError }] = await Promise.all([
    sb!.from('close_friends').select('friend_id').eq('owner_id', userId),
    sb!.from('close_friends').select('owner_id').eq('friend_id', userId)
  ])
  if (ownedError || incomingError) {
    console.error('load close friends failed', ownedError ?? incomingError)
    setCloseFriendsError(toCloseFriendsError())
    return
  }
  setCloseFriendIds(new Set((ownedData ?? []).map((row) => row.friend_id).filter(Boolean)))
  setIncomingCloseFriendOwnerIds(new Set((incomingData ?? []).map((row) => row.owner_id).filter(Boolean)))
}

const loadIncomingCustomPosts = async (userId: string) => {
  const { data, error } = await sb!.from('post_recipients').select('post_id').eq('recipient_id', userId)
  if (error) {
    console.error('load incoming custom posts failed', error)
    return
  }
  setIncomingCustomPostIds(new Set((data ?? []).map((row) => row.post_id).filter(Boolean)))
}

const loadDiscoverUsers = async (userId: string) => {
  setDiscoverStatus('loading')
  setDiscoverError('')
  const { data, error } = await sb!.from('profiles').select('id,username,display_name,avatar_url,bio').neq('id', userId).order('display_name', { ascending: true, nullsFirst: false }).limit(100)
  if (error) {
    console.error('load discover users failed', error)
    setDiscoverUsers([])
    setDiscoverStatus('error')
    setDiscoverError(toDiscoverError())
    return
  }
  setDiscoverUsers(data ?? [])
  setDiscoverStatus('loaded')
}

const initializeUserData = async (activeSession: Session) => {
  const userId = activeSession.user.id
  await Promise.allSettled([
    withTimeout(ensureProfile(activeSession), INIT_TIMEOUT_MS),
    withTimeout(loadPosts(), INIT_TIMEOUT_MS),
    withTimeout(loadFollowing(userId), INIT_TIMEOUT_MS),
    withTimeout(loadCloseFriends(userId), INIT_TIMEOUT_MS),
    withTimeout(loadDiscoverUsers(userId), INIT_TIMEOUT_MS),
    withTimeout(loadIncomingCustomPosts(userId), INIT_TIMEOUT_MS)
  ])
}

const ensureProfile = async (activeSession: Session | null) => {
  if (!activeSession?.user) return setProfile(null)
  const id = activeSession.user.id
  const metadata = activeSession.user.user_metadata ?? {}
  const emailLocalPart = activeSession.user.email?.split('@')[0] ?? 'user'
  const displayName = metadata.full_name ?? metadata.name ?? emailLocalPart
  const avatar = metadata.avatar_url ?? metadata.picture ?? null
  const username = `${emailLocalPart}_${id.replace(/-/g, '').slice(0, 6)}`
  const fallbackProfile: Profile = { id, username, display_name: displayName, avatar_url: avatar, bio: '' }
  const { data: existingProfile, error: existingError } = await sb!.from('profiles').select('id,username,display_name,avatar_url,bio').eq('id', id).maybeSingle()
  if (existingError) throw existingError
  if (existingProfile) {
    setProfile({ ...existingProfile, bio: existingProfile.bio ?? '' })
    return
  }
  const { data: insertedProfile, error: insertError } = await sb!.from('profiles').insert({
    id,
    username,
    display_name: displayName,
    avatar_url: avatar
  }).select('id,username,display_name,avatar_url,bio').single()
  if (insertError) throw insertError
  setProfile(insertedProfile ? { ...insertedProfile, bio: insertedProfile.bio ?? '' } : fallbackProfile)
}

useEffect(() => () => { stopRecorder(); if (recordedUrl) URL.revokeObjectURL(recordedUrl) }, [recordedUrl])
useEffect(() => { if (screen !== 'compose' && isRecording) stopRecorder() }, [screen, isRecording])
useEffect(() => { if (screen !== 'profile') setViewingProfileId(null) }, [screen])
useEffect(() => () => { playAudioRef.current?.pause() }, [])

useEffect(() => {
  const targetId = viewingProfileId
  if (!targetId || targetId === profile?.id || profileMap[targetId]) return
  let mounted = true
  void sb!.from('profiles').select('id,username,display_name,avatar_url,bio').eq('id', targetId).single().then(({ data }) => {
    if (!mounted || !data) return
    setProfileMap((prev) => ({ ...prev, [data.id]: { username: data.username, display_name: data.display_name, avatar_url: data.avatar_url, bio: data.bio ?? '' } }))
  })
  return () => { mounted = false }
}, [viewingProfileId, profile?.id])
useEffect(() => {
  if (!supabase) {
    setInitialAuthLoading(false)
    isRestoringSessionRef.current = false
    setSessionRestoreError('設定エラー: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を確認してください。')
    return
  }

  let isMounted = true
  const bootstrap = async () => {
    try {
      const { data, error } = await withTimeout(sb!.auth.getSession(), INIT_TIMEOUT_MS)
      if (!isMounted) return
      if (error) throw error
      setSession(data.session ?? null)
      setInitialAuthLoading(false)
      isRestoringSessionRef.current = false
      if (!data.session) return
      void initializeUserData(data.session)
    } catch (error) {
      console.error('initial session restore failed', error)
      if (isMounted) {
        setSessionRestoreError('読み込みに失敗しました。再読み込みしても改善しない場合は設定を確認してください。')
        setInitialAuthLoading(false)
      }
      isRestoringSessionRef.current = false
    }
  }

  void bootstrap()
  const { data: listener } = sb!.auth.onAuthStateChange((_event, newSession) => {
    if (!isMounted || isRestoringSessionRef.current) return
    setSession(newSession)
    if (!newSession) return
    void initializeUserData(newSession)
  })

  return () => {
    isMounted = false
    listener.subscription.unsubscribe()
  }
}, [])

const activeProfileId = viewingProfileId ?? session?.user.id ?? null
const viewedProfile = activeProfileId ? (activeProfileId === profile?.id ? profile : (profileMap[activeProfileId] ? { id: activeProfileId, ...profileMap[activeProfileId], bio: profileMap[activeProfileId].bio ?? '' } : null)) : null
const isOwnProfile = !!session?.user?.id && activeProfileId === session.user.id
const profileEditAvatarPreview = selectedAvatarPreviewUrl || profileEditForm.avatar_url.trim() || viewedProfile?.avatar_url || ''

const openProfileEditor = () => {
  if (!isOwnProfile || !viewedProfile) return
  setProfileEditForm({
    display_name: viewedProfile.display_name ?? '',
    username: viewedProfile.username ?? '',
    bio: viewedProfile.bio ?? '',
    avatar_url: viewedProfile.avatar_url ?? ''
  })
  setProfileEditErrors({})
  setProfileEditMessage('')
  setSelectedAvatarFile(null)
  setSelectedAvatarPreviewUrl('')
  setIsEditingProfile(true)
}

const closeProfileEditor = () => {
  if (selectedAvatarPreviewUrl) URL.revokeObjectURL(selectedAvatarPreviewUrl)
  setSelectedAvatarFile(null)
  setSelectedAvatarPreviewUrl('')
  setIsEditingProfile(false)
  setProfileEditErrors({})
  setProfileEditMessage('')
}

const clearSelectedAvatarFile = () => {
  if (selectedAvatarPreviewUrl) URL.revokeObjectURL(selectedAvatarPreviewUrl)
  setSelectedAvatarFile(null)
  setSelectedAvatarPreviewUrl('')
}

const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0] ?? null
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    setProfileEditErrors((prev) => ({ ...prev, avatar_url: '画像ファイルを選択してください' }))
    return
  }
  if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
    setProfileEditErrors((prev) => ({ ...prev, avatar_url: '画像サイズは5MB以内にしてください' }))
    return
  }
  if (selectedAvatarPreviewUrl) URL.revokeObjectURL(selectedAvatarPreviewUrl)
  const previewUrl = URL.createObjectURL(file)
  setSelectedAvatarFile(file)
  setSelectedAvatarPreviewUrl(previewUrl)
  setProfileEditErrors((prev) => ({ ...prev, avatar_url: '' }))
  setProfileEditMessage('')
}

const validateProfileEditForm = (form: ProfileEditForm) => {
  const nextErrors: Partial<Record<keyof ProfileEditForm, string>> = {}
  const displayName = form.display_name.trim()
  const username = form.username.trim()
  const bio = form.bio.trim()
  const avatarUrl = form.avatar_url.trim()
  if (displayName.length < 1 || displayName.length > 30) nextErrors.display_name = '表示名は1〜30文字で入力してください。'
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) nextErrors.username = 'ユーザー名は英数字と_のみ、3〜30文字で入力してください。'
  if (bio.length > 160) nextErrors.bio = '自己紹介は160文字以内で入力してください。'
  if (avatarUrl.length > 0) {
    try { new URL(avatarUrl) } catch { nextErrors.avatar_url = 'アイコン画像URLの形式が正しくありません。' }
  }
  return nextErrors
}

const saveProfileEdit = async () => {
  if (!session?.user?.id || !profile || !sb) return
  const normalizedForm: ProfileEditForm = {
    display_name: profileEditForm.display_name.trim(),
    username: profileEditForm.username.trim(),
    bio: profileEditForm.bio.trim(),
    avatar_url: profileEditForm.avatar_url.trim()
  }
  const nextErrors = validateProfileEditForm(normalizedForm)
  setProfileEditErrors(nextErrors)
  if (Object.keys(nextErrors).length > 0) return
  setIsSavingProfile(true)
  setProfileEditMessage('')
  let avatarUrlForSave = normalizedForm.avatar_url || null
  if (selectedAvatarFile) {
    setProfileEditMessage('画像をアップロード中...')
    const extension = (selectedAvatarFile.name.split('.').pop() || 'jpg').toLowerCase()
    const safeExt = /^[a-z0-9]+$/.test(extension) ? extension : 'jpg'
    const filePath = `${session.user.id}/profile-${Date.now()}.${safeExt}`
    const uploadResult = await sb.storage.from(AVATAR_BUCKET).upload(filePath, selectedAvatarFile, { upsert: false, contentType: selectedAvatarFile.type })
    if (uploadResult.error) {
      setIsSavingProfile(false)
      setProfileEditMessage('')
      setProfileEditErrors((prev) => ({ ...prev, avatar_url: '画像のアップロードに失敗しました。' }))
      return
    }
    const { data: publicUrlData } = sb.storage.from(AVATAR_BUCKET).getPublicUrl(filePath)
    avatarUrlForSave = publicUrlData.publicUrl
  }
  const updatePayload = { ...normalizedForm, avatar_url: avatarUrlForSave, updated_at: new Date().toISOString() }
  const { data, error } = await sb.from('profiles').update(updatePayload).eq('id', session.user.id).select('id,username,display_name,avatar_url,bio,updated_at').single()
  setIsSavingProfile(false)
  if (error) {
    const duplicate = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase().includes('duplicate') || `${error.message ?? ''}`.toLowerCase().includes('unique')
    setProfileEditErrors((prev) => ({ ...prev, username: duplicate ? 'このユーザー名は既に使用されています。' : prev.username }))
    setProfileEditMessage(duplicate ? '' : 'プロフィールの保存に失敗しました。')
    return
  }
  if (!data) return
  setProfile((prev) => prev ? { ...prev, ...data, bio: data.bio ?? '' } : prev)
  setProfileMap((prev) => ({ ...prev, [session.user.id]: { username: data.username, display_name: data.display_name, avatar_url: data.avatar_url, bio: data.bio ?? '' } }))
  setCommentProfileMap((prev) => ({ ...prev, [session.user.id]: { username: data.username, display_name: data.display_name, avatar_url: data.avatar_url, bio: data.bio ?? '' } }))
  setDiscoverUsers((prev) => prev.map((item) => item.id === session.user.id ? { ...item, ...data, bio: data.bio ?? item.bio } : item))
  clearSelectedAvatarFile()
  setIsEditingProfile(false)
  setProfileEditMessage('プロフィールを更新しました。')
}
const canViewPost = (post: Post, viewerId: string) => {
  if (post.visibility === 'private') return post.user_id === viewerId
  if (post.visibility === 'close_friends') return post.user_id === viewerId || incomingCloseFriendOwnerIds.has(post.user_id)
  if (post.visibility === 'specific') return post.user_id === viewerId || incomingCustomPostIds.has(post.id)
  return true
}
const myPosts = useMemo(() => {
  if (!activeProfileId || !session?.user.id) return []
  return posts.filter((post) => post.user_id === activeProfileId && canViewPost(post, session.user.id))
}, [posts, activeProfileId, session?.user.id, incomingCloseFriendOwnerIds, incomingCustomPostIds])
const homePosts = useMemo(() => {
  const myId = session?.user.id
  if (!myId) return []
  return posts.filter((post) => {
    const visibleByOwnerOrFollow = post.user_id === myId || followingIds.has(post.user_id)
    if (!visibleByOwnerOrFollow) return false
    return canViewPost(post, myId)
  })
}, [posts, followingIds, incomingCloseFriendOwnerIds, incomingCustomPostIds, session?.user.id])
const homeTimelineItems = useMemo(() => {
  const postItems: TimelineItem[] = homePosts.map((post) => ({ type: 'post', post, created_at: post.created_at }))
  return [...postItems, ...homeRepostItems].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}, [homePosts, homeRepostItems])
const followingProfiles = useMemo(() => discoverUsers.filter((user) => followingIds.has(user.id) && user.id !== session?.user.id), [discoverUsers, followingIds, session?.user.id])
const hasFollowingPosts = useMemo(() => {
  const myId = session?.user.id
  if (!myId) return false
  return homePosts.some((post) => post.user_id !== myId)
}, [homePosts, session?.user.id])
useEffect(() => {
  const myId = session?.user.id
  if (!myId) return
  const targetUserIds = [myId, ...Array.from(followingIds)]
  void loadHomeRepostItems(myId, targetUserIds)
}, [session?.user.id, followingIds, posts, incomingCloseFriendOwnerIds, incomingCustomPostIds])
const profileName = profile?.display_name ?? 'friendcast user'
const formatDate = (value: string) => new Date(value).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const handleCreatePost = async () => {
  const text = composeText.trim()
  if (isPosting) return
  if (!session?.user || (!text && !recordedBlob)) return
  if (composeVisibility === 'close_friends' && closeFriendIds.size === 0) setErrorMessage('親しい友達がまだ設定されていません。')
  if (composeVisibility === 'specific' && selectedCustomRecipientIds.size === 0) {
    setCustomRecipientError('届けたい相手を選んでください')
    setErrorMessage('カスタム公開先を1人以上選択してください。')
    return
  }
  setIsPosting(true); setErrorMessage(''); setPostingStatusMessage('投稿を準備中...')
  let storagePath: string | null = null
  let postId: string | null = null
  let shouldGoHome = false
  try {
  if (recordedBlob) {
    storagePath = `${session.user.id}/${Date.now()}.${(recordedBlob.type.split('/')[1] || 'webm').replace('x-', '')}`
    setPostingStatusMessage('音声をアップロード中...')
    const { error } = await withTimeout(sb!.storage.from('voice-posts').upload(storagePath, recordedBlob, { contentType: recordedBlob.type, upsert: false }))
    if (error) throw new Error('STORAGE_UPLOAD_FAILED')
  }
  const kind: PostKind = recordedBlob ? (text ? 'text_audio' : 'audio') : 'text'
  setPostingStatusMessage('投稿を保存中...')
  const { data: postData, error: postError } = await withTimeout(sb!.from('posts').insert({ user_id: session.user.id, text, visibility: composeVisibility || defaultVisibility, kind }).select('id').single())
  if (postError || !postData?.id) throw postError ?? new Error('POST_SAVE_FAILED')
  postId = postData.id
  if (composeVisibility === 'specific') {
    const recipientRows = Array.from(selectedCustomRecipientIds).map((recipientId) => ({ post_id: postData.id, recipient_id: recipientId }))
    const { error: recipientError } = await withTimeout(sb!.from('post_recipients').insert(recipientRows))
    if (recipientError) throw recipientError
  }
  if (recordedBlob && storagePath) {
    setPostingStatusMessage('音声情報を保存中...')
    // recordedDurationMs(録音実測ミリ秒)を audio_assets.duration_ms に保存する。
    const safeDurationMs = Number.isFinite(recordedDurationMs) && recordedDurationMs > 0 ? Math.round(recordedDurationMs) : null
    const { error: audioError } = await withTimeout(sb!.from('audio_assets').insert({ owner_id: session.user.id, post_id: postData.id, storage_bucket: 'voice-posts', storage_path: storagePath, mime_type: recordedBlob.type, duration_ms: safeDurationMs, size_bytes: recordedBlob.size }))
    if (audioError) throw audioError
  }
    shouldGoHome = true
  await loadIncomingCustomPosts(session.user.id)
  await loadPosts()
  } catch (error: any) {
    console.error('create post failed', error)
    if (postId) await sb!.from('posts').delete().eq('id', postId)
    if (storagePath) await sb!.storage.from('voice-posts').remove([storagePath])
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
      setSelectedCustomRecipientIds(new Set())
      setCustomRecipientError('')
      goToScreen('home')
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
  const currentSeconds = isPlaying ? playingCurrentTimeSeconds : (audioCurrentTimeMap[post.id] ?? 0)
  const baseDurationSeconds = (() => {
    const savedDuration = audioDurationMap[post.id]
    if (typeof savedDuration === 'number' && Number.isFinite(savedDuration) && savedDuration > 0) return savedDuration
    const assetDuration = post.audioAsset.duration_ms ? post.audioAsset.duration_ms / 1000 : 0
    return Number.isFinite(assetDuration) && assetDuration > 0 ? assetDuration : 0
  })()
  const totalDuration = baseDurationSeconds > 0 ? formatDuration(baseDurationSeconds * 1000) : formatDuration(post.audioAsset.duration_ms)
  const elapsedDuration = formatDuration(Math.max(0, Math.floor(currentSeconds)) * 1000)
  const durationLabel = `${elapsedDuration} / ${totalDuration}`
  const canSeek = state === 'ready' && activeAudioPostId === post.id && baseDurationSeconds > 0 && Number.isFinite(baseDurationSeconds)
  const progressPercent = baseDurationSeconds > 0 ? Math.min(100, Math.max(0, (currentSeconds / baseDurationSeconds) * 100)) : 0
  const clampTime = (value: number, duration: number) => Math.min(Math.max(value, 0), duration)
  const updateTimeState = (nextTime: number, nextDuration?: number) => {
    setPlayingCurrentTimeSeconds(nextTime)
    setAudioCurrentTimeMap((prev) => ({ ...prev, [post.id]: nextTime }))
    if (typeof nextDuration === 'number' && Number.isFinite(nextDuration) && nextDuration > 0) {
      setAudioDurationMap((prev) => ({ ...prev, [post.id]: nextDuration }))
    }
  }
  const seekToRatio = (ratio: number) => {
    const audio = playAudioRef.current
    if (!audio || activeAudioPostId !== post.id) return
    const duration = audio.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    const nextTime = clampTime(ratio * duration, duration)
    try {
      audio.currentTime = nextTime
      updateTimeState(nextTime, duration)
    } catch (error) {
      console.error('audio seek failed', error)
    }
  }
  const seekBy = (deltaSeconds: number) => {
    const audio = playAudioRef.current
    if (!audio || activeAudioPostId !== post.id) return
    const duration = audio.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    const nextTime = clampTime(audio.currentTime + deltaSeconds, duration)
    try {
      audio.currentTime = nextTime
      updateTimeState(nextTime, duration)
    } catch (error) {
      console.error('audio seek failed', error)
    }
  }
  const play = async () => {
    const asset = post.audioAsset
    if (!asset) return
    if (activeAudioPostId === post.id) {
      playAudioRef.current?.pause()
      setActiveAudioPostId(null)
      const current = playAudioRef.current?.currentTime ?? 0
      setAudioCurrentTimeMap((prev) => ({ ...prev, [post.id]: current }))
      setPlayingCurrentTimeSeconds(current)
      return
    }
    setAudioLoadError((p) => ({ ...p, [post.id]: '' }))
    let url = audioUrlMap[post.id]
    if (!url) {
      setAudioLoadState((p) => ({ ...p, [post.id]: 'loading' }))
      const { data, error } = await sb!.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 30)
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
    const startAt = audioCurrentTimeMap[post.id] ?? 0
    playAudioRef.current.currentTime = startAt
    playAudioRef.current.ontimeupdate = () => {
      const current = playAudioRef.current?.currentTime ?? 0
      const duration = playAudioRef.current?.duration ?? 0
      updateTimeState(current, duration)
    }
    playAudioRef.current.onpause = () => {
      setActiveAudioPostId((current) => (current === post.id ? null : current))
    }
    playAudioRef.current.onended = () => {
      setActiveAudioPostId(null)
      setPlayingCurrentTimeSeconds(0)
      setAudioCurrentTimeMap((prev) => ({ ...prev, [post.id]: 0 }))
    }
    try {
      await playAudioRef.current.play()
      setActiveAudioPostId(post.id)
      const duration = playAudioRef.current.duration
      updateTimeState(startAt, duration)
    } catch (error) {
      console.error('audio play failed', error)
      setAudioLoadError((p) => ({ ...p, [post.id]: '再生できませんでした。もう一度タップしてください。' }))
      setActiveAudioPostId(null)
    }
  }
  return <div className={`audio-card ${isPlaying ? 'is-active' : ''}`}><button className="audio-play audio-play-button" type="button" onClick={play}><span className={`play-icon ${isPlaying ? 'is-stop' : ''}`}>{isPlaying ? '■' : '▷'}</span></button><div className="audio-main"><div className={`audio-wave ${isPlaying ? 'playing' : ''}`}>{Array.from({ length: 18 }).map((_, i) => <i key={i} style={{ height: `${8 + ((i % 6) * 4)}px`, animationDelay: `${i * 0.05}s` }} />)}</div><div className="audio-meta-row"><span className="audio-duration">{durationLabel}</span>{isPlaying && <small className="audio-playing-label">再生中</small>}</div><div className="audio-seek-row"><button type="button" className="audio-seek-step" onClick={() => seekBy(-5)} disabled={!canSeek}>-5秒</button><input className="audio-seek" type="range" min={0} max={1000} step={1} value={Math.round(progressPercent * 10)} onChange={(event) => seekToRatio(Number(event.target.value) / 1000)} disabled={!canSeek} aria-label="再生位置" /><button type="button" className="audio-seek-step" onClick={() => seekBy(5)} disabled={!canSeek}>+5秒</button></div>{!canSeek && state === 'loading' && <small>再生準備中です...</small>}</div>{state === 'loading' && <small>読み込み中...</small>}{audioLoadError[post.id] && <small className="status-error">{audioLoadError[post.id]}</small>}</div>
}

const getAvatarInitial = (name: string) => name.slice(0, 1).toUpperCase()
const goToProfile = (userId: string) => {
  setViewingProfileId(userId)
  setScreen('profile')
  window.requestAnimationFrame(() => safeScrollToTop())
}
const goToScreen = (nextScreen: Screen) => {
  if (nextScreen === 'compose') safeScrollToTop()
  setScreen(nextScreen)
}
const adjustComposeTextareaHeight = () => {
  const textarea = composeTextareaRef.current
  if (!textarea) return
  textarea.style.height = 'auto'
  const nextHeight = Math.min(textarea.scrollHeight, 128)
  textarea.style.height = `${Math.max(nextHeight, 48)}px`
}
const handleComposeTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
  setComposeText(event.target.value.slice(0, MAX_COMPOSE_LENGTH))
}
const toggleCustomRecipient = (userId: string) => {
  setSelectedCustomRecipientIds((prev) => {
    const next = new Set(prev)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    return next
  })
  setCustomRecipientError('')
  setErrorMessage('')
}

useEffect(() => {
  if (screen === 'compose') safeScrollToTop()
}, [screen])


useEffect(() => {
  if (screen !== 'profile') {
    lastProfileScrollKeyRef.current = ''
    return
  }
  const targetProfileId = viewingProfileId ?? session?.user.id ?? null
  if (!targetProfileId) return
  const nextKey = `${screen}:${targetProfileId}`
  if (lastProfileScrollKeyRef.current === nextKey) return
  lastProfileScrollKeyRef.current = nextKey
  window.setTimeout(() => safeScrollToTop(), 0)
}, [screen, viewingProfileId, session?.user.id])

useEffect(() => {
  if (screen === 'compose') adjustComposeTextareaHeight()
}, [screen, composeText])

useEffect(() => {
  const postIds = posts.map((post) => post.id)
  if (postIds.length === 0) {
    setCommentsCountMap({})
    setOpenedCommentsPostId(null)
    return
  }
  void loadCommentsCount(postIds)
}, [posts])

useEffect(() => {
  const userId = session?.user.id
  if (!userId) return
  const postIds = posts.map((post) => post.id)
  void loadLikesForPosts(postIds, userId)
  void loadRepostsForPosts(postIds, userId)
}, [posts, session?.user.id])

if (!isSupabaseConfigured || !supabase) return <div className={`app-shell theme-${resolvedTheme}`}><main className="screen login-screen"><article className="login-card"><h1>friendcast</h1><p className="status-message status-error">設定エラー: Supabaseの環境変数が不足しています。</p><p>VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を Vercel Preview に設定してください。</p></article></main></div>
if (initialAuthLoading) return <div className={`app-shell theme-${resolvedTheme}`}><div className="login-card"><h1>friendcast</h1><p>ログイン状態を確認中です...（最大8秒）</p></div></div>
if (!session) return <div className={`app-shell theme-${resolvedTheme}`}><main className="screen login-screen"><article className="login-card"><h1>friendcast</h1><p>親しい人にだけ届ける、声のタイムライン</p>{sessionRestoreError && <p className="status-message status-error">{sessionRestoreError}</p>}<button className="google-login-btn" onClick={async () => { const redirectTo = getAuthRedirectUrl(); await supabase?.auth.signInWithOAuth({ provider: 'google', options: redirectTo ? { redirectTo } : undefined }) }}>Googleでログイン</button></article></main></div>


const handleDeletePost = async (post: Post) => {
  if (!session?.user || post.user_id !== session.user.id) return
  const confirmed = window.confirm('この投稿を削除しますか？')
  if (!confirmed) return
  setDeletingPostId(post.id)
  setPostActionError((prev) => ({ ...prev, [post.id]: '' }))
  try {
    if (post.audioAsset?.storage_path) {
      const { error: storageError } = await sb!.storage.from(post.audioAsset.storage_bucket).remove([post.audioAsset.storage_path])
      if (storageError) console.error('storage delete failed', storageError)
      const { error: assetError } = await sb!.from('audio_assets').delete().eq('post_id', post.id).eq('owner_id', session.user.id)
      if (assetError) console.error('audio_assets delete failed', assetError)
    }
    const { error: postDeleteError } = await sb!.from('posts').delete().eq('id', post.id).eq('user_id', session.user.id)
    if (postDeleteError) throw postDeleteError
    setCommentsCountMap((prev) => {
      const next = { ...prev }
      delete next[post.id]
      return next
    })
    setLikesCountMap((prev) => {
      const next = { ...prev }
      delete next[post.id]
      return next
    })
    setLikedPostIds((prev) => { const next = new Set(prev); next.delete(post.id); return next })
    setRepostedPostIds((prev) => { const next = new Set(prev); next.delete(post.id); return next })
    setRepostsCountMap((prev) => { const next = { ...prev }; delete next[post.id]; return next })
    if (openedCommentsPostId === post.id) setOpenedCommentsPostId(null)
    await loadPosts()
  } catch (error) {
    console.error('post delete failed', error)
    setPostActionError((prev) => ({ ...prev, [post.id]: toFriendlyError('delete') }))
  } finally {
    setDeletingPostId(null)
  }
}

const resolvePostAuthor = (post: Post): PostProfile | null => {
  if (!post?.user_id) return null
  return profileMap[post.user_id] ?? null
}
const isFollowing = (userId: string) => followingIds.has(userId)
const isFollowPending = (userId: string) => followPendingIds.has(userId)
const isLikePending = (postId: string) => likePendingPostIds.has(postId)
const isLikedPost = (postId: string) => likedPostIds.has(postId)
const isRepostPending = (postId: string) => repostPendingPostIds.has(postId)
const isRepostedPost = (postId: string) => repostedPostIds.has(postId)
const togglePostLike = async (postId: string) => {
  if (!session?.user || isLikePending(postId)) return
  const userId = session.user.id
  const currentlyLiked = isLikedPost(postId)
  setLikePendingPostIds((prev) => new Set(prev).add(postId))
  setPostActionError((prev) => ({ ...prev, [postId]: '' }))
  try {
    if (currentlyLiked) {
      const { error } = await sb!.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId)
      if (error) throw error
      setLikedPostIds((prev) => { const next = new Set(prev); next.delete(postId); return next })
      setLikesCountMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 0) - 1) }))
    } else {
      const { error } = await sb!.from('post_likes').insert({ post_id: postId, user_id: userId })
      if (error) throw error
      setLikedPostIds((prev) => new Set(prev).add(postId))
      setLikesCountMap((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }))
    }
  } catch (error) {
    console.error('toggle like failed', error)
    setPostActionError((prev) => ({ ...prev, [postId]: toFriendlyError('like_toggle') }))
  } finally {
    setLikePendingPostIds((prev) => { const next = new Set(prev); next.delete(postId); return next })
  }
}

const togglePostRepost = async (postId: string) => {
  if (!session?.user || isRepostPending(postId)) return
  const userId = session.user.id
  const currentlyReposted = isRepostedPost(postId)
  setRepostPendingPostIds((prev) => new Set(prev).add(postId))
  setPostActionError((prev) => ({ ...prev, [postId]: '' }))
  try {
    if (currentlyReposted) {
      const { error } = await sb!.from('post_reposts').delete().eq('post_id', postId).eq('user_id', userId)
      if (error) throw error
      setRepostedPostIds((prev) => { const next = new Set(prev); next.delete(postId); return next })
      setRepostsCountMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 0) - 1) }))
    } else {
      const { error } = await sb!.from('post_reposts').insert({ post_id: postId, user_id: userId })
      if (error) throw error
      setRepostedPostIds((prev) => new Set(prev).add(postId))
      setRepostsCountMap((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }))
    }
  } catch (error) {
    console.error('toggle repost failed', error)
    setPostActionError((prev) => ({ ...prev, [postId]: toFriendlyError('repost_toggle') }))
  } finally {
    if (session?.user?.id) {
      const targetUserIds = [session.user.id, ...Array.from(followingIds)]
      void loadHomeRepostItems(session.user.id, targetUserIds)
    }
    setRepostPendingPostIds((prev) => { const next = new Set(prev); next.delete(postId); return next })
  }
}

const toggleFollow = async (targetUserId: string) => {
  if (!session?.user || targetUserId === session.user.id || isFollowPending(targetUserId)) return
  const me = session.user.id
  setFollowPendingIds((prev) => new Set(prev).add(targetUserId))
  setFollowActionError('')
  try {
    if (isFollowing(targetUserId)) {
      const { error } = await sb!.from('follows').delete().eq('follower_id', me).eq('following_id', targetUserId)
      if (error) throw error
      const { error: closeFriendDeleteError } = await sb!.from('close_friends').delete().eq('owner_id', me).eq('friend_id', targetUserId)
      if (closeFriendDeleteError) console.error('close friend cleanup failed', closeFriendDeleteError)
      setFollowingIds((prev) => { const next = new Set(prev); next.delete(targetUserId); return next })
      setCloseFriendIds((prev) => { const next = new Set(prev); next.delete(targetUserId); return next })
    } else {
      const { error } = await sb!.from('follows').insert({ follower_id: me, following_id: targetUserId })
      if (error) throw error
      setFollowingIds((prev) => new Set(prev).add(targetUserId))
    }
  } catch (error) {
    console.error('toggle follow failed', error)
    setFollowActionError(toFollowError())
  } finally {
    setFollowPendingIds((prev) => { const next = new Set(prev); next.delete(targetUserId); return next })
  }
}

const isCloseFriendPending = (userId: string) => closeFriendsPendingIds.has(userId)
const toggleCloseFriend = async (targetUserId: string) => {
  if (!session?.user || targetUserId === session.user.id || isCloseFriendPending(targetUserId)) return
  const me = session.user.id
  setCloseFriendsPendingIds((prev) => new Set(prev).add(targetUserId))
  setCloseFriendsError('')
  try {
    if (closeFriendIds.has(targetUserId)) {
      const { error } = await sb!.from('close_friends').delete().eq('owner_id', me).eq('friend_id', targetUserId)
      if (error) throw error
      setCloseFriendIds((prev) => { const next = new Set(prev); next.delete(targetUserId); return next })
    } else {
      const { error } = await sb!.from('close_friends').insert({ owner_id: me, friend_id: targetUserId })
      if (error) throw error
      setCloseFriendIds((prev) => new Set(prev).add(targetUserId))
    }
  } catch (error) {
    console.error('toggle close friend failed', error)
    setCloseFriendsError(toCloseFriendsError())
  } finally {
    setCloseFriendsPendingIds((prev) => { const next = new Set(prev); next.delete(targetUserId); return next })
  }
}

const toggleCommentsPanel = async (postId: string) => {
  if (openedCommentsPostId === postId) return setOpenedCommentsPostId(null)
  setOpenedCommentsPostId(postId)
  await loadCommentsForPost(postId)
}

const handleCreateComment = async (postId: string) => {
  if (!session?.user) {
    if (postId) setCommentsErrorMap((prev) => ({ ...prev, [postId]: 'コメント送信にはログインが必要です。' }))
    return
  }
  if (!postId) {
    setErrorMessage('コメントの送信先が見つかりません。画面を再読み込みしてもう一度お試しください。')
    return
  }
  if (commentPostingMap[postId]) return
  const draft = commentInputMap[postId] ?? ''
  const body = draft.trim()
  if (!body) {
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: 'コメントを入力してください。' }))
    return
  }
  if (body.length > 140) {
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: 'コメントは140文字以内で入力してください。' }))
    return
  }

  setCommentPostingMap((prev) => ({ ...prev, [postId]: true }))
  setCommentsErrorMap((prev) => ({ ...prev, [postId]: '' }))
  try {
    const { data, error } = await sb!.from('comments').insert({ post_id: postId, user_id: session.user.id, body }).select('id,post_id,user_id,body,created_at').single()
    if (error || !data) throw (error ?? new Error('insert failed'))
    const nextComment = data as CommentRow
    setCommentsByPostId((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), nextComment] }))
    setCommentInputMap((prev) => ({ ...prev, [postId]: '' }))
    setCommentsCountMap((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }))
  } catch (error) {
    console.error('comment post failed', error)
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: toFriendlyError('comment_post') }))
  } finally {
    setCommentPostingMap((prev) => ({ ...prev, [postId]: false }))
  }
}

const handleDeleteComment = async (postId: string, comment: CommentRow) => {
  if (!session?.user || comment.user_id !== session.user.id || commentDeletingMap[comment.id]) return
  const confirmed = window.confirm('このコメントを削除しますか？')
  if (!confirmed) return
  setCommentDeletingMap((prev) => ({ ...prev, [comment.id]: true }))
  try {
    const { error } = await sb!.from('comments').delete().eq('id', comment.id).eq('user_id', session.user.id)
    if (error) throw error
    setCommentsByPostId((prev) => ({ ...prev, [postId]: (prev[postId] ?? []).filter((item) => item.id !== comment.id) }))
    setCommentsCountMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 0) - 1) }))
  } catch (error) {
    console.error('comment delete failed', error)
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: toFriendlyError('comment_delete') }))
  } finally {
    setCommentDeletingMap((prev) => ({ ...prev, [comment.id]: false }))
  }
}

const renderTimelinePost = (post: Post, options?: { compact?: boolean; showFollowButton?: boolean; repostMeta?: { repostedBy: Profile; repostedAt: string } }) => { const compact = options?.compact ?? false; const showFollowButton = options?.showFollowButton ?? false; const repostMeta = options?.repostMeta; const authorProfile = resolvePostAuthor(post); const isOwnPost = post.user_id === session?.user.id; const displayName = authorProfile?.display_name ?? authorProfile?.username ?? 'friendcast user'; const handle = authorProfile?.username ? `@${authorProfile.username}` : '@user'; const isCommentsOpen = openedCommentsPostId === post.id; const comments = commentsByPostId[post.id] ?? []; const commentDraft = commentInputMap[post.id] ?? ''; const commentBody = commentDraft.trim(); const isCommentSubmitting = !!commentPostingMap[post.id]; const canSubmitComment = !!session?.user && !!post.id && commentBody.length > 0 && commentBody.length <= 140 && !isCommentSubmitting; return <article key={`${post.id}_${repostMeta?.repostedBy.id ?? 'post'}`} className="post-card tweet-item" role="article">{repostMeta && <button type="button" className="repost-meta" onClick={() => goToProfile(repostMeta.repostedBy.id)}>↻ {repostMeta.repostedBy.display_name ?? repostMeta.repostedBy.username}さんがリポストしました ・ {formatDate(repostMeta.repostedAt)}</button>}<div className="post-header"><button className="post-avatar tweet-avatar" onClick={() => goToProfile(post.user_id)} style={authorProfile?.avatar_url ? { backgroundImage: `url(${authorProfile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{displayName.slice(0, 1)}</button><div className="post-header-main"><button className="tweet-header author-link tweet-author-link" onClick={() => goToProfile(post.user_id)} type="button"><div className="post-user-line"><span className="post-user-name">{displayName}</span><span className="post-action-text">{handle}</span></div></button><time className="post-date">{formatDate(post.created_at)}</time></div><div className="post-header-actions">{showFollowButton && !isOwnPost && <button className={`follow-btn ${isFollowing(post.user_id) ? 'is-following' : ''}`} disabled={isFollowPending(post.user_id)} onClick={() => void toggleFollow(post.user_id)} type="button">{isFollowPending(post.user_id) ? '処理中...' : (isFollowing(post.user_id) ? 'フォロー中' : 'フォロー')}</button>}<div className="visibility-badge"><span>{visibilityBadgeIcon[post.visibility]}</span><span>{visibilityComposeLabel[post.visibility]}</span></div>{isOwnPost && <button className="post-delete-btn post-delete-button" aria-label="投稿を削除" disabled={deletingPostId === post.id} onClick={() => void handleDeletePost(post)}>{deletingPostId === post.id ? '…' : '🗑️'}</button>}</div></div><div className="post-content tweet-content"><p className="post-text tweet-text">{post.text}</p>{renderAudioPlayer(post)}{postActionError[post.id] && <p className="inline-error">{postActionError[post.id]}</p>}{!compact && <p className="post-sub-text delivery-inline"><small>{audienceLabel[post.visibility]}に届きます</small></p>}</div><div className="post-actions action-row"><button className="icon-btn" onClick={() => void toggleCommentsPanel(post.id)}>💬 <span>{commentsCountMap[post.id] ?? 0}</span></button><button className={`icon-btn repost-btn ${isRepostedPost(post.id) ? 'active-icon reposted' : ''}`} onClick={() => void togglePostRepost(post.id)} disabled={isRepostPending(post.id)} aria-pressed={isRepostedPost(post.id)}>🔁 <span>{repostsCountMap[post.id] ?? 0}</span></button><button className={`icon-btn like-btn ${isLikedPost(post.id) ? 'active-icon liked' : ''}`} onClick={() => void togglePostLike(post.id)} disabled={isLikePending(post.id)} aria-pressed={isLikedPost(post.id)}>{isLikedPost(post.id) ? '♥' : '♡'} <span>{likesCountMap[post.id] ?? 0}</span></button><button className={`icon-btn ${savedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setSavedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}><ShareIcon /></button></div>{isCommentsOpen && <section className="comments-panel"><div className="comment-input-row"><textarea maxLength={140} value={commentDraft} onChange={(event) => setCommentInputMap((prev) => ({ ...prev, [post.id]: event.target.value }))} placeholder="コメントを書く..." className="compose-textarea" rows={2} /><div className="compose-sticky-action"><p className="compose-counter">{commentDraft.length} / 140</p><button className={`compose-post-btn comment-submit-btn ${canSubmitComment ? 'is-enabled' : 'is-disabled'}`} type="button" disabled={!canSubmitComment} aria-disabled={!canSubmitComment} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void handleCreateComment(post.id) }}>{isCommentSubmitting ? '送信中...' : '送信'}</button></div></div>{commentsErrorMap[post.id] && <p className="inline-error">{commentsErrorMap[post.id]}</p>}{commentsLoadingMap[post.id] && <p className="status-message">コメントを読み込み中...</p>}{!commentsLoadingMap[post.id] && comments.length === 0 && <p className="status-message">まだコメントはありません</p>}{!commentsLoadingMap[post.id] && comments.length > 0 && <div>{comments.map((comment) => { const cProfile = commentProfileMap[comment.user_id]; const cName = cProfile?.display_name ?? cProfile?.username ?? 'friendcast user'; const cHandle = cProfile?.username ? `@${cProfile.username}` : '@user'; const isOwnComment = comment.user_id === session?.user.id; return <article key={comment.id} className="discover-user-item"><span className="discover-user-main"><span className="discover-avatar" style={cProfile?.avatar_url ? { backgroundImage: `url(${cProfile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(cName)}</span><span className="discover-user-meta"><strong>{cName}</strong><small>{cHandle} ・ {formatDate(comment.created_at)}</small><span>{comment.body}</span></span></span>{isOwnComment && <button type="button" className="post-delete-btn" disabled={commentDeletingMap[comment.id]} onClick={() => void handleDeleteComment(post.id, comment)}>{commentDeletingMap[comment.id] ? '…' : '削除'}</button>}</article> })}</div>}</section>}</article> }

return <div className={`app-shell theme-${resolvedTheme}`}><main className="screen">{screen === 'home' && <section className="screen-home"><header className="home-mobile-header"><button className="mini-avatar" onClick={() => { setViewingProfileId(session.user.id); goToScreen('profile') }} style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(profileName)}</button><h1>friendcast</h1><span className="header-spacer" /></header>{postsStatus === 'error' && <p className="status-message status-error">{postsError}</p>}{postsStatus === 'loading' && <p className="status-message">投稿を読み込み中です...</p>}{followActionError && <p className="status-message status-error">{followActionError}</p>}{homePosts.length === 0 && postsStatus !== 'loading' && <p className="status-message">投稿はまだありません</p>}{homePosts.length > 0 && !hasFollowingPosts && <div className="discover-guide"><p>フォロー中のユーザーの投稿はまだありません。検索から友達をフォローしてみましょう。</p><button type="button" onClick={() => goToScreen('search')}>ユーザーを探す</button></div>}<div className="timeline-list">{homeTimelineItems.map((item) => item.type === 'post' ? renderTimelinePost(item.post) : renderTimelinePost(item.post, { repostMeta: { repostedBy: item.repostedBy, repostedAt: item.reposted_at } }))}</div></section>}{screen === 'profile' && <section className="profile-screen"><div className="profile-block"><div className="profile-top-row"><div className="profile-photo" style={viewedProfile?.avatar_url ? { backgroundImage: `url(${viewedProfile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(viewedProfile?.display_name ?? viewedProfile?.username ?? 'U')}</div>{isOwnProfile ? <button className="profile-edit-btn" type="button" onClick={openProfileEditor}>プロフィールを編集</button> : <button className={`profile-edit-btn ${activeProfileId && isFollowing(activeProfileId) ? 'is-following' : ''}`} disabled={!activeProfileId || isFollowPending(activeProfileId)} onClick={() => activeProfileId && void toggleFollow(activeProfileId)}>{activeProfileId && isFollowPending(activeProfileId) ? '処理中...' : (activeProfileId && isFollowing(activeProfileId) ? 'フォロー中' : 'フォロー')}</button>}</div><h3 className="profile-name">{viewedProfile?.display_name ?? 'friendcast user'}</h3><p className="profile-id">{viewedProfile?.username ? `@${viewedProfile.username}` : '@user'}</p><p className="profile-bio">{viewedProfile?.bio || '自己紹介はまだありません。'}</p>{isOwnProfile && isEditingProfile && <div className="profile-edit-panel"><div className="profile-edit-avatar" style={profileEditAvatarPreview ? { backgroundImage: `url(${profileEditAvatarPreview})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(profileEditForm.display_name || profileEditForm.username || 'U')}</div><label>表示名<input type="text" maxLength={30} value={profileEditForm.display_name} onChange={(event) => { setProfileEditForm((prev) => ({ ...prev, display_name: event.target.value })); setProfileEditErrors((prev) => ({ ...prev, display_name: '' })) }} /></label>{profileEditErrors.display_name && <p className="inline-error">{profileEditErrors.display_name}</p>}<label>ユーザー名<input type="text" maxLength={30} value={profileEditForm.username} onChange={(event) => { setProfileEditForm((prev) => ({ ...prev, username: event.target.value })); setProfileEditErrors((prev) => ({ ...prev, username: '' })) }} /></label>{profileEditErrors.username && <p className="inline-error">{profileEditErrors.username}</p>}<label>自己紹介<textarea rows={3} maxLength={160} value={profileEditForm.bio} onChange={(event) => { setProfileEditForm((prev) => ({ ...prev, bio: event.target.value })); setProfileEditErrors((prev) => ({ ...prev, bio: '' })) }} /></label>{profileEditErrors.bio && <p className="inline-error">{profileEditErrors.bio}</p>}<label>写真を選ぶ<input type="file" accept="image/*" onChange={handleAvatarFileChange} /></label>{selectedAvatarFile && <button type="button" onClick={clearSelectedAvatarFile} disabled={isSavingProfile}>選択を解除</button>}<label>アイコン画像URL<input type="url" value={profileEditForm.avatar_url} onChange={(event) => { setProfileEditForm((prev) => ({ ...prev, avatar_url: event.target.value })); setProfileEditErrors((prev) => ({ ...prev, avatar_url: '' })) }} placeholder="https://example.com/avatar.jpg" /></label>{profileEditErrors.avatar_url && <p className="inline-error">{profileEditErrors.avatar_url}</p>}{profileEditMessage && <p className="status-message">{profileEditMessage}</p>}<div className="profile-edit-actions"><button type="button" onClick={() => void saveProfileEdit()} disabled={isSavingProfile}>{isSavingProfile ? '保存中...' : '保存'}</button><button type="button" onClick={closeProfileEditor} disabled={isSavingProfile}>キャンセル</button></div></div>}</div><div className="tabs profile-tabs"><button className={profileTab === 'posts' ? 'active-tab' : ''} onClick={() => setProfileTab('posts')}>投稿</button><button className={profileTab === 'audio' ? 'active-tab' : ''} onClick={() => setProfileTab('audio')}>ボイス</button></div><div className="timeline-list">{profilePostsToRender.map((post) => renderTimelinePost(post, { compact: true, showFollowButton: false }))}</div></section>}{screen === 'search' && <section className="search-screen"><article className="search-panel"><h2>検索</h2><h3>ユーザーを見つける</h3>{discoverError && <p className="status-message status-error search-status">{discoverError}</p>}{followActionError && <p className="status-message status-error search-status">{followActionError}</p>}{discoverStatus === 'loading' && <p className="status-message search-status">ユーザーを読み込み中です...</p>}{discoverStatus === 'loaded' && discoverUsers.length === 0 && <p className="status-message search-status">まだ他のユーザーがいません</p>}<div className="discover-list">{discoverUsers.map((user) => { const name = user.display_name ?? user.username; return <article className="discover-user-item" key={user.id}><button type="button" className="discover-user-main" onClick={() => goToProfile(user.id)}><span className="discover-avatar" style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>@{user.username}</small></span></button><button className={`follow-btn ${isFollowing(user.id) ? 'is-following' : ''}`} type="button" onClick={() => void toggleFollow(user.id)} disabled={isFollowPending(user.id)}>{isFollowPending(user.id) ? '処理中...' : (isFollowing(user.id) ? 'フォロー中' : 'フォロー')}</button></article> })}</div></article></section>}{screen === 'settings' && <section className="search-screen"><article className="search-panel"><h2>設定</h2><h3>テーマ</h3><div className="tabs"><button className={theme === 'light' ? 'active-tab' : ''} onClick={() => setTheme('light')}>ライト</button><button className={theme === 'dark' ? 'active-tab' : ''} onClick={() => setTheme('dark')}>ダーク</button></div><h3>公開範囲の初期設定</h3><div className="visibility-grid">{(['followers','close_friends','specific','private'] as Visibility[]).map((v) => <button key={v} className={`visibility-item ${defaultVisibility === v ? 'selected' : ''}`} onClick={() => setDefaultVisibility(v)}>{visibilityComposeLabel[v]}</button>)}</div><section className="friends-settings"><h3>親しい友達</h3><p className="status-message">親しい友達に追加した人だけに届く投稿で使います。</p>{closeFriendsError && <p className="status-message status-error">{closeFriendsError}</p>}{discoverStatus === 'loaded' && discoverUsers.filter((user) => followingIds.has(user.id) && user.id !== session.user.id).length === 0 && <p className="status-message">フォロー中のユーザーがまだいません。検索から友達をフォローしてみましょう。</p>}<div className="discover-list">{discoverUsers.filter((user) => followingIds.has(user.id) && user.id !== session.user.id).map((user) => { const name = user.display_name ?? user.username; const added = closeFriendIds.has(user.id); const pending = isCloseFriendPending(user.id); return <article className="discover-user-item" key={user.id}><button type="button" className="discover-user-main" onClick={() => goToProfile(user.id)}><span className="discover-avatar" style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>@{user.username}</small></span></button><button className={`follow-btn ${added ? 'is-following' : ''}`} type="button" onClick={() => void toggleCloseFriend(user.id)} disabled={pending}>{pending ? '処理中...' : (added ? '追加済み' : '追加')}</button></article> })}</div></section><p className="status-message">自分のテスト投稿は、ホーム/プロフィールの各投稿から削除できます。</p><button className="logout-btn" onClick={() => sb?.auth.signOut()}>ログアウト</button></article></section>}{screen === 'compose' && <section className="compose-screen"><div className="compose-topbar compose-topbar-compact"><button className="compose-close-button" aria-label="ホームに戻る" onClick={() => goToScreen('home')} type="button">×</button></div><textarea ref={composeTextareaRef} rows={2} maxLength={MAX_COMPOSE_LENGTH} value={composeText} onChange={handleComposeTextChange} onInput={adjustComposeTextareaHeight} placeholder="いまどうしてる？" className="compose-textarea" /><p className={`compose-counter ${composeText.length >= MAX_COMPOSE_LENGTH ? 'is-limit' : composeText.length >= 120 ? 'is-near-limit' : ''}`}>{composeText.length} / {MAX_COMPOSE_LENGTH}</p><article className="record-card"><div className={`record-waveform ${isRecording ? 'live' : ''}`}>{Array.from({ length: 12 }).map((_, i) => <span key={i} className="record-bar" style={{ animationDelay: `${i * 0.06}s` }} />)}</div><button className={`record-fab ${isRecording ? 'recording' : ''}`} onClick={toggleRecording} type="button">🎙</button><p>{isRecording ? '録音中... タップして停止' : 'タップして録音を開始'}</p><p>{isRecording ? formatDuration(recordingSeconds * 1000) : (recordedBlob ? formatDuration(recordedDurationMs) : '')}</p>{recordedBlob && <div className="audio-preview"><button type="button" className="voice-play-button" onClick={() => { if (!previewAudioRef.current && recordedUrl) previewAudioRef.current = new Audio(recordedUrl); void previewAudioRef.current?.play() }}><span className="play-icon">▷</span><span>再生確認</span></button><button type="button" onClick={handleClearRecordedAudio}>削除</button></div>}{recordingError && <p className="compose-error-message">{recordingError}</p>}{!isRecordSupported && <p className="compose-error-message">このブラウザでは録音に対応していません</p>}</article><div className="compose-visibility-area"><p className="compose-visibility-label">公開範囲</p><div className="visibility-chip-group">{(['followers','close_friends','specific','private'] as Visibility[]).map((v) => <button key={v} className={`visibility-chip ${composeVisibility === v ? 'active' : ''}`} onClick={() => { setComposeVisibility(v); setCustomRecipientError(''); setErrorMessage('') }} type="button">{visibilityComposeLabel[v]}</button>)}</div>{composeVisibility === 'close_friends' && closeFriendIds.size === 0 && <p className="custom-audience-inline-note">親しい友達がまだ設定されていません。</p>}{composeVisibility === 'specific' && <div className="custom-recipient-panel"><p className="custom-audience-inline-note">選択中：{selectedCustomRecipientIds.size}人</p>{followingProfiles.length === 0 ? <p className="custom-audience-inline-note">フォロー中のユーザーがいません。検索からユーザーをフォローしてください</p> : <div className="discover-list">{followingProfiles.map((user) => { const selected = selectedCustomRecipientIds.has(user.id); const name = user.display_name ?? user.username; return <button key={user.id} type="button" className={`discover-user-item ${selected ? 'is-selected' : ''}`} onClick={() => toggleCustomRecipient(user.id)}><span className="discover-user-main"><span className="discover-avatar" style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>@{user.username}</small></span></span><span className="follow-btn">{selected ? '選択中' : '選択'}</span></button> })}</div>}{selectedCustomRecipientIds.size === 0 && <p className="custom-audience-inline-note">届けたい相手を選んでください</p>}{customRecipientError && <p className="compose-error-message">{customRecipientError}</p>}</div>}</div><div className="compose-sticky-action"><button className="compose-post-btn" disabled={(!composeText.trim() && !recordedBlob) || isPosting} onClick={handleCreatePost}>{isPosting ? '投稿中...' : '投稿する'}</button>{postingStatusMessage && <p className="compose-status-message">{postingStatusMessage}</p>}{errorMessage && <p className="compose-error-message">{errorMessage}</p>}</div></section>}</main>{showBottomNav && <nav className="bottom-nav" aria-label="メインナビ"><button className={screen === 'home' ? 'nav-active' : ''} onClick={() => goToScreen('home')}><span>🏠</span><small>ホーム</small></button><button className={screen === 'search' ? 'nav-active' : ''} onClick={() => goToScreen('search')}><span>🔎</span><small>検索</small></button><button onClick={() => goToScreen('compose')}><span>➕</span><small>投稿</small></button><button className={screen === 'profile' ? 'nav-active' : ''} onClick={() => goToScreen('profile')}><span>👤</span><small>プロフ</small></button><button className={screen === 'settings' ? 'nav-active' : ''} onClick={() => goToScreen('settings')}><span>⚙️</span><small>設定</small></button></nav>}{showGlobalFab && <button className="fab global-fab" onClick={() => goToScreen('compose')}>🎙</button>}</div>
}
