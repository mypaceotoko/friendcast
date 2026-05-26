import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { audienceLabel, type Visibility } from './mockData'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import FriendcastLogo from './components/FriendcastLogo'

type Screen = 'home' | 'compose' | 'detail' | 'profile' | 'search' | 'settings'
type Theme = 'dark' | 'light' | 'system'
type ProfileTab = 'posts' | 'audio' | 'replies' | 'likes'
type PostKind = 'text' | 'audio' | 'text_audio'

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null; bio: string }
type PostProfile = { username: string; display_name: string | null; avatar_url: string | null; bio: string }
type CommentType = 'text' | 'voice'
type CommentRow = { id: string; post_id: string; user_id: string; body?: string | null; created_at: string; comment_type?: CommentType; audio_url?: string | null; audio_duration_seconds?: number | null }
type CommentProfileMap = Record<string, PostProfile>
type AudioAsset = { id: string; post_id: string; storage_bucket: string; storage_path: string; mime_type: string | null; duration_ms: number | null; size_bytes: number | null }
type SupabasePostRow = { id: string; text: string; visibility: Visibility; created_at: string; user_id: string; kind: PostKind | null; audio_assets?: AudioAsset[] }
type Post = SupabasePostRow & { audioAsset: AudioAsset | null }
type TimelineItem = { type: 'post'; post: Post; created_at: string } | { type: 'repost'; post: Post; repostedBy: Profile; reposted_at: string; created_at: string }
type ProfileMap = Record<string, PostProfile>
type PostsStatus = 'idle' | 'loading' | 'loaded' | 'error'
type DiscoverStatus = 'idle' | 'loading' | 'loaded' | 'error'
type ProfileEditForm = { display_name: string; username: string; bio: string; avatar_url: string }
type InviteRow = { id: string; inviter_id: string; code: string; used_by: string | null; used_at: string | null; created_at: string; expires_at: string | null; status: string }
type ActivityItem = { id: string; type: 'comment' | 'like' | 'repost' | 'follow' | 'invite_used'; actor: Profile; postId?: string; postPreview?: string; body?: string; commentType?: CommentType; code?: string; createdAt: string }

const visibilityComposeLabel: Record<Visibility, string> = { followers: 'フォロワー', close_friends: '親しい友達', specific: 'カスタム', private: '自分のみ' }
const visibilityBadgeIcon: Record<Visibility, string> = { followers: '◉', close_friends: '◎', specific: '✦', private: '◐' }

const visibilityDefaultDescription: Record<Visibility, string> = {
  followers: 'あなたをフォローしている人に届く投稿です。',
  close_friends: '親しい友達に追加した人だけに届く投稿です。',
  specific: '投稿画面で、届けたい相手を選んで投稿します。',
  private: '自分だけが見られる投稿です。メモやテスト投稿に使えます。'
}


const ENABLE_PROFILE_FOLLOW_COUNTS = true
const ENABLE_PROFILE_FOLLOW_LISTS = true
const ShareIcon = () => <svg className="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="M8 11l8-5" /><path d="M8 13l8 5" /></svg>
// duration_ms は「録音時間の長さ(ms)」を保持する値。表示は mm:ss に統一する。
const MAX_COMPOSE_LENGTH = 140
const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024
const MAX_RECORDING_SECONDS = 600
const MAX_RECORDING_MS = MAX_RECORDING_SECONDS * 1000
const MAX_VOICE_REPLY_SECONDS = 180
const MAX_VOICE_REPLY_MS = MAX_VOICE_REPLY_SECONDS * 1000

const formatDuration = (ms: number | null | undefined) => {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '--:--'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

const formatDurationSeconds = (seconds: number | null | undefined, fallback = '--:--') => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return fallback
  const safeSeconds = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`
}

const safeScrollToTop = () => {
  if (typeof window === 'undefined') return
  window.scrollTo(0, 0)
}


const PENDING_INVITE_KEY = 'pendingInviteCode'
const WELCOME_DISMISSED_KEY = 'friendcast_welcome_dismissed_v1'
const INVITE_PREFIX = 'FC-'
const generateInviteCode = () => `${INVITE_PREFIX}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const normalizeInviteCode = (value: string) => value.trim().toUpperCase()
const getInviteShareUrl = (code: string) => {
  if (typeof window === 'undefined') return `/?invite=${encodeURIComponent(code)}`
  return `${window.location.origin}/?invite=${encodeURIComponent(code)}`
}
const getInviteShareText = (code: string) => `friendcastに招待しました！\nこのリンクから参加してね👇\n${getInviteShareUrl(code)}`

const getAuthRedirectUrl = () => {
  if (typeof window === 'undefined') return undefined
  if (!window.location?.origin) return undefined
  try {
    return new URL('/', window.location.origin).toString()
  } catch {
    return undefined
  }
}

const readLocalStorage = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch (error) {
    console.warn(`Failed to read localStorage key: ${key}`, error)
    return null
  }
}

const writeLocalStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch (error) {
    console.warn(`Failed to write localStorage key: ${key}`, error)
    return false
  }
}

const removeLocalStorage = (key: string) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.removeItem(key)
    return true
  } catch (error) {
    console.warn(`Failed to remove localStorage key: ${key}`, error)
    return false
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
const [recordingNotice, setRecordingNotice] = useState('')
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
const playbackRateOptions = [1.0, 1.2, 1.5, 2.0] as const
const [audioPlaybackRate, setAudioPlaybackRate] = useState<number>(1.2)
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
const [profileFollowCounts, setProfileFollowCounts] = useState<{ following: number; followers: number }>({ following: 0, followers: 0 })
const [profileFollowingUsers, setProfileFollowingUsers] = useState<Profile[]>([])
const [profileFollowerUsers, setProfileFollowerUsers] = useState<Profile[]>([])
const [myFollowerIds, setMyFollowerIds] = useState<Set<string>>(new Set())
const [profileFollowListMode, setProfileFollowListMode] = useState<'posts' | 'following' | 'followers'>('posts')
const [profileFollowListLoading, setProfileFollowListLoading] = useState(false)
const [profileFollowListError, setProfileFollowListError] = useState('')
const [inviteCodeInput, setInviteCodeInput] = useState('')
const [pendingInviteCode, setPendingInviteCode] = useState('')
const [inviteActionMessage, setInviteActionMessage] = useState('')
const [inviteActionError, setInviteActionError] = useState('')
const [inviteSuccessNotice, setInviteSuccessNotice] = useState('')
const [inviteCloseFriendCard, setInviteCloseFriendCard] = useState<{ inviterId: string; inviterName: string; inviterAvatarUrl: string; added: boolean } | null>(null)
const [inviteCloseFriendPending, setInviteCloseFriendPending] = useState(false)
const [inviteCloseFriendError, setInviteCloseFriendError] = useState('')
const [showWelcomeCard, setShowWelcomeCard] = useState(false)
const [isInviteCreating, setIsInviteCreating] = useState(false)
const [isInviteUsing, setIsInviteUsing] = useState(false)
const [inviteRevokingMap, setInviteRevokingMap] = useState<Record<string, boolean>>({})
const [myInvites, setMyInvites] = useState<InviteRow[]>([])
const [isCloseFriendsOpen, setIsCloseFriendsOpen] = useState(false)
const [isInvitesOpen, setIsInvitesOpen] = useState(false)
const [isActivityOpen, setIsActivityOpen] = useState(false)
const [activityItems, setActivityItems] = useState<ActivityItem[]>([])
const [activityLoading, setActivityLoading] = useState(false)
const [activityError, setActivityError] = useState('')
const [discoverUsers, setDiscoverUsers] = useState<Profile[]>([])
const [discoverStatus, setDiscoverStatus] = useState<DiscoverStatus>('idle')
const [discoverError, setDiscoverError] = useState('')
const [searchQuery, setSearchQuery] = useState('')
const [friendSuggestions, setFriendSuggestions] = useState<Profile[]>([])
const [friendSuggestionsStatus, setFriendSuggestionsStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
const [friendSuggestionsError, setFriendSuggestionsError] = useState('')
const [commentsCountMap, setCommentsCountMap] = useState<Record<string, number>>({})
const [openedCommentsPostId, setOpenedCommentsPostId] = useState<string | null>(null)
const [commentsByPostId, setCommentsByPostId] = useState<Record<string, CommentRow[]>>({})
const [homeRepostItems, setHomeRepostItems] = useState<TimelineItem[]>([])
const [commentProfileMap, setCommentProfileMap] = useState<CommentProfileMap>({})
const [commentsLoadingMap, setCommentsLoadingMap] = useState<Record<string, boolean>>({})
const [commentsErrorMap, setCommentsErrorMap] = useState<Record<string, string>>({})
const [commentInputMap, setCommentInputMap] = useState<Record<string, string>>({})
const [commentPostingMap, setCommentPostingMap] = useState<Record<string, boolean>>({})
const [voiceCommentPostingMap, setVoiceCommentPostingMap] = useState<Record<string, boolean>>({})
const [commentDeletingMap, setCommentDeletingMap] = useState<Record<string, boolean>>({})
const [commentReplyModeByPostId, setCommentReplyModeByPostId] = useState<Record<string, 'text' | 'voice'>>({})
const [voiceReplyBlobByPostId, setVoiceReplyBlobByPostId] = useState<Record<string, Blob>>({})
const [voiceReplyPreviewUrlByPostId, setVoiceReplyPreviewUrlByPostId] = useState<Record<string, string>>({})
const [voiceReplyDurationByPostId, setVoiceReplyDurationByPostId] = useState<Record<string, number>>({})
const [voiceReplyRecordingSecondsByPostId, setVoiceReplyRecordingSecondsByPostId] = useState<Record<string, number>>({})
const [voiceReplyErrorByPostId, setVoiceReplyErrorByPostId] = useState<Record<string, string>>({})
const [voiceReplySuccessByPostId, setVoiceReplySuccessByPostId] = useState<Record<string, string>>({})
const [voiceReplyRecordingPostId, setVoiceReplyRecordingPostId] = useState<string | null>(null)
const [voiceReplyPreviewPlayingPostId, setVoiceReplyPreviewPlayingPostId] = useState<string | null>(null)
const [voiceReplyPreviewCurrentTimeByPostId, setVoiceReplyPreviewCurrentTimeByPostId] = useState<Record<string, number>>({})
const [playingVoiceCommentId, setPlayingVoiceCommentId] = useState<string | null>(null)
const [voiceCommentCurrentTimeById, setVoiceCommentCurrentTimeById] = useState<Record<string, number>>({})
const [voiceCommentDurationById, setVoiceCommentDurationById] = useState<Record<string, number>>({})
const [isEditingProfile, setIsEditingProfile] = useState(false)
const [profileEditForm, setProfileEditForm] = useState<ProfileEditForm>({ display_name: '', username: '', bio: '', avatar_url: '' })
const [profileEditErrors, setProfileEditErrors] = useState<Partial<Record<keyof ProfileEditForm, string>>>({})
const [profileEditMessage, setProfileEditMessage] = useState('')
const [isSavingProfile, setIsSavingProfile] = useState(false)
const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null)
const [selectedAvatarPreviewUrl, setSelectedAvatarPreviewUrl] = useState('')
const avatarFileInputRef = useRef<HTMLInputElement | null>(null)
const isRestoringSessionRef = useRef(true)
const INIT_TIMEOUT_MS = 8000
const mediaRecorderRef = useRef<MediaRecorder | null>(null)
const mediaStreamRef = useRef<MediaStream | null>(null)
const chunksRef = useRef<BlobPart[]>([])
const recordingTimerRef = useRef<number | null>(null)
const recordingStartAtRef = useRef<number | null>(null)
const isStoppingRecorderRef = useRef(false)
const previewAudioRef = useRef<HTMLAudioElement | null>(null)
const playAudioRef = useRef<HTMLAudioElement | null>(null)
const composeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
const lastProfileScrollKeyRef = useRef<string>('')
const voiceReplyMediaRecorderRef = useRef<MediaRecorder | null>(null)
const voiceReplyMediaStreamRef = useRef<MediaStream | null>(null)
const voiceReplyChunksRef = useRef<BlobPart[]>([])
const voiceReplyTimerRef = useRef<number | null>(null)
const voiceReplyStartAtRef = useRef<number | null>(null)
const isStoppingVoiceReplyRecorderRef = useRef(false)
const voiceReplyPreviewAudioRef = useRef<HTMLAudioElement | null>(null)
const voiceCommentAudioRef = useRef<HTMLAudioElement | null>(null)

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
  if (isStoppingRecorderRef.current) return
  isStoppingRecorderRef.current = true
  if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
  recordingTimerRef.current = null
  if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
  mediaStreamRef.current = null
  setIsRecording(false)
}

const startRecording = async () => {
  if (!isRecordSupported) return setRecordingError(toFriendlyError('record_unsupported'))
  try {
    setRecordingError('')
    setRecordingNotice('')
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
      isStoppingRecorderRef.current = false
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
    isStoppingRecorderRef.current = false
    setIsRecording(true)
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((prev) => {
        const next = prev + 1
        if (next >= MAX_RECORDING_SECONDS) {
          stopRecorder()
          setRecordingNotice(`最大録音時間の${Math.floor(MAX_RECORDING_SECONDS / 60)}分に達したため、録音を停止しました。`)
          return MAX_RECORDING_SECONDS
        }
        return next
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
  setRecordingNotice('')
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

const stopVoiceReplyPreview = (resetTime = false) => {
  const audio = voiceReplyPreviewAudioRef.current
  if (audio) {
    audio.pause()
    audio.onended = null
    audio.ontimeupdate = null
    audio.onerror = null
    if (resetTime) audio.currentTime = 0
  }
  voiceReplyPreviewAudioRef.current = null
  setVoiceReplyPreviewPlayingPostId(null)
}

const playVoiceReplyPreview = async (postId: string) => {
  const previewUrl = voiceReplyPreviewUrlByPostId[postId]
  if (!previewUrl) return
  try {
    if (voiceReplyPreviewPlayingPostId === postId) {
      stopVoiceReplyPreview()
      return
    }
    stopVoiceReplyPreview()
    playAudioRef.current?.pause()
    const audio = new Audio(previewUrl)
    voiceReplyPreviewAudioRef.current = audio
    audio.onended = () => {
      setVoiceReplyPreviewCurrentTimeByPostId((prev) => ({ ...prev, [postId]: 0 }))
      stopVoiceReplyPreview()
    }
    audio.ontimeupdate = () => {
      setVoiceReplyPreviewCurrentTimeByPostId((prev) => ({ ...prev, [postId]: audio.currentTime }))
    }
    audio.onerror = () => {
      stopVoiceReplyPreview()
      setVoiceReplyErrorByPostId((prev) => ({ ...prev, [postId]: 'プレビュー再生に失敗しました。再録音をお試しください。' }))
    }
    await audio.play()
    setVoiceReplyPreviewPlayingPostId(postId)
  } catch {
    stopVoiceReplyPreview()
    setVoiceReplyErrorByPostId((prev) => ({ ...prev, [postId]: 'プレビュー再生に失敗しました。再録音をお試しください。' }))
  }
}

const clearVoiceReplyForPost = (postId: string) => {
  if (voiceReplyPreviewPlayingPostId === postId) stopVoiceReplyPreview(true)
  const previewUrl = voiceReplyPreviewUrlByPostId[postId]
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  setVoiceReplyBlobByPostId((prev) => { const next = { ...prev }; delete next[postId]; return next })
  setVoiceReplyPreviewUrlByPostId((prev) => { const next = { ...prev }; delete next[postId]; return next })
  setVoiceReplyDurationByPostId((prev) => { const next = { ...prev }; delete next[postId]; return next })
  setVoiceReplyRecordingSecondsByPostId((prev) => ({ ...prev, [postId]: 0 }))
  setVoiceReplyPreviewCurrentTimeByPostId((prev) => ({ ...prev, [postId]: 0 }))
  setVoiceReplyErrorByPostId((prev) => ({ ...prev, [postId]: '' }))
}
const stopVoiceReplyRecorder = () => {
  if (isStoppingVoiceReplyRecorderRef.current) return
  isStoppingVoiceReplyRecorderRef.current = true
  if (voiceReplyTimerRef.current) window.clearInterval(voiceReplyTimerRef.current)
  voiceReplyTimerRef.current = null
  if (voiceReplyMediaRecorderRef.current?.state === 'recording') voiceReplyMediaRecorderRef.current.stop()
  voiceReplyMediaStreamRef.current?.getTracks().forEach((track) => track.stop())
}
const startVoiceReplyRecording = async (postId: string) => {
  if (!isRecordSupported || voiceReplyRecordingPostId) return
  try {
    setVoiceReplyErrorByPostId((prev) => ({ ...prev, [postId]: '' }))
    clearVoiceReplyForPost(postId)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    voiceReplyMediaStreamRef.current = stream
    voiceReplyMediaRecorderRef.current = recorder
    voiceReplyChunksRef.current = []
    voiceReplyStartAtRef.current = Date.now()
    setVoiceReplyRecordingPostId(postId)
    setVoiceReplyRecordingSecondsByPostId((prev) => ({ ...prev, [postId]: 0 }))
    isStoppingVoiceReplyRecorderRef.current = false
    recorder.ondataavailable = (event) => { if (event.data.size > 0) voiceReplyChunksRef.current.push(event.data) }
    recorder.onstop = () => {
      const endedAt = Date.now()
      const startAt = voiceReplyStartAtRef.current ?? endedAt
      const durationMs = Math.min(Math.max(0, endedAt - startAt), MAX_VOICE_REPLY_MS)
      const blob = new Blob(voiceReplyChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      const url = URL.createObjectURL(blob)
      setVoiceReplyBlobByPostId((prev) => ({ ...prev, [postId]: blob }))
      setVoiceReplyPreviewUrlByPostId((prev) => ({ ...prev, [postId]: url }))
      setVoiceReplyDurationByPostId((prev) => ({ ...prev, [postId]: durationMs }))
      setVoiceReplyRecordingSecondsByPostId((prev) => ({ ...prev, [postId]: Math.min(MAX_VOICE_REPLY_SECONDS, Math.round(durationMs / 1000)) }))
      setVoiceReplyRecordingPostId((current) => current === postId ? null : current)
      voiceReplyChunksRef.current = []
      voiceReplyStartAtRef.current = null
      voiceReplyMediaRecorderRef.current = null
      voiceReplyMediaStreamRef.current = null
      isStoppingVoiceReplyRecorderRef.current = false
    }
    recorder.start()
    voiceReplyTimerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - (voiceReplyStartAtRef.current ?? Date.now())) / 1000)
      setVoiceReplyRecordingSecondsByPostId((prev) => ({ ...prev, [postId]: Math.min(elapsed, MAX_VOICE_REPLY_SECONDS) }))
      if (elapsed >= MAX_VOICE_REPLY_SECONDS) stopVoiceReplyRecorder()
    }, 250)
  } catch {
    setVoiceReplyErrorByPostId((prev) => ({ ...prev, [postId]: toFriendlyError('mic') }))
    setVoiceReplyRecordingPostId(null)
  }
}
const stopVoiceReplyRecording = (postId: string) => {
  if (voiceReplyRecordingPostId !== postId) return
  stopVoiceReplyRecorder()
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
    const { data, error } = await sb!.from('comments').select('id,post_id,user_id,body,created_at,comment_type,audio_url,audio_duration_seconds').eq('post_id', postId).order('created_at', { ascending: true })
    if (error) throw error
    const comments = ((data ?? []) as CommentRow[]).map((comment) => ({ ...comment, comment_type: (comment.comment_type === 'voice' ? 'voice' : 'text') as CommentType, body: typeof comment.body === 'string' ? comment.body : '' }))
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


const loadFriendSuggestions = async (userId: string) => {
  if (!sb) return
  setFriendSuggestionsStatus('loading')
  setFriendSuggestionsError('')
  try {
    const { data: candidateProfiles, error: candidateProfilesError } = await sb
      .from('profiles')
      .select('id,username,display_name,avatar_url,bio')
      .neq('id', userId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(40)
    if (candidateProfilesError) throw candidateProfilesError
    setFriendSuggestions(Array.isArray(candidateProfiles) ? candidateProfiles.slice(0, 10) : [])
    setFriendSuggestionsStatus('loaded')
  } catch (error) {
    console.error('load friend suggestions failed', error)
    setFriendSuggestions([])
    setFriendSuggestionsStatus('error')
    setFriendSuggestionsError('友達候補を読み込めませんでした')
  }
}

const initializeUserData = async (activeSession: Session) => {
  const userId = activeSession.user.id
  await Promise.allSettled([
    withTimeout(ensureProfile(activeSession), INIT_TIMEOUT_MS),
    withTimeout(loadPosts(), INIT_TIMEOUT_MS),
    withTimeout(loadFollowing(userId), INIT_TIMEOUT_MS),
    withTimeout(loadCloseFriends(userId), INIT_TIMEOUT_MS),
    withTimeout(loadDiscoverUsers(userId), INIT_TIMEOUT_MS),
    withTimeout(loadFriendSuggestions(userId), INIT_TIMEOUT_MS),
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
useEffect(() => () => {
  stopVoiceReplyPreview()
  stopVoiceReplyRecorder()
  Object.values(voiceReplyPreviewUrlByPostId).forEach((url) => URL.revokeObjectURL(url))
}, [voiceReplyPreviewUrlByPostId])
useEffect(() => {
  if (!openedCommentsPostId) {
    if (voiceReplyRecordingPostId) stopVoiceReplyRecorder()
    stopVoiceReplyPreview()
  }
}, [openedCommentsPostId, voiceReplyRecordingPostId])
useEffect(() => { if (screen !== 'profile') setViewingProfileId(null) }, [screen])

useEffect(() => { setProfileFollowListMode('posts'); setProfileFollowListError('') }, [viewingProfileId, screen])
useEffect(() => () => { playAudioRef.current?.pause(); stopVoiceCommentPlayback() }, [])

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
  if (avatarFileInputRef.current) avatarFileInputRef.current.value = ''
}

const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.currentTarget.files?.[0] ?? null
  if (!file) return
  if (!file.type.startsWith('image/')) {
    clearSelectedAvatarFile()
    setProfileEditErrors((prev) => ({ ...prev, avatar_url: '画像ファイルを選択してください' }))
    return
  }
  if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
    clearSelectedAvatarFile()
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

const openAvatarPicker = () => {
  avatarFileInputRef.current?.click()
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
    const uploadResult = await sb.storage.from(AVATAR_BUCKET).upload(filePath, selectedAvatarFile, { cacheControl: '3600', upsert: false, contentType: selectedAvatarFile.type || 'image/jpeg' })
    if (uploadResult.error) {
      const message = uploadResult.error.message ?? ''
      const statusCode = String(uploadResult.error.statusCode ?? '')
      console.error('Avatar upload failed:', { message, statusCode, error: uploadResult.error, bucket: AVATAR_BUCKET, filePath })
      setIsSavingProfile(false)
      setProfileEditMessage('')
      if (message.toLowerCase().includes('bucket') && message.toLowerCase().includes('not found')) {
        setProfileEditErrors((prev) => ({ ...prev, avatar_url: 'avatarsバケットが見つかりません。Supabase Storage設定を確認してください。' }))
      } else if (statusCode === '401' || statusCode === '403' || message.toLowerCase().includes('row-level security') || message.toLowerCase().includes('permission') || message.toLowerCase().includes('policy')) {
        setProfileEditErrors((prev) => ({ ...prev, avatar_url: '画像アップロード権限がありません。Storage policyを確認してください。' }))
      } else {
        setProfileEditErrors((prev) => ({ ...prev, avatar_url: '画像のアップロードに失敗しました。' }))
      }
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
const normalizedSearchQuery = searchQuery.trim().toLowerCase()
const isSearchingUsers = normalizedSearchQuery.length > 0
const filteredDiscoverUsers = useMemo(() => {
  if (!normalizedSearchQuery) return discoverUsers
  return discoverUsers.filter((user) => {
    const name = (user.display_name ?? '').toLowerCase()
    const username = (user.username ?? '').toLowerCase()
    return name.includes(normalizedSearchQuery) || username.includes(normalizedSearchQuery)
  })
}, [discoverUsers, normalizedSearchQuery])
const visibleFriendSuggestions = useMemo(() => {
  const myId = session?.user.id
  const uniqueById = new Map<string, Profile>()
  friendSuggestions.forEach((user) => {
    if (!user.id) return
    if (user.id === myId) return
    if (!uniqueById.has(user.id)) uniqueById.set(user.id, user)
  })
  const ordered = Array.from(uniqueById.values()).sort((a, b) => {
    const aFollowing = followingIds.has(a.id)
    const bFollowing = followingIds.has(b.id)
    if (aFollowing === bFollowing) return 0
    return aFollowing ? 1 : -1
  })
  return ordered.slice(0, 8)
}, [friendSuggestions, followingIds, session?.user.id])
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
  const cyclePlaybackRate = () => {
    setAudioPlaybackRate((prev) => {
      const index = playbackRateOptions.findIndex((rate) => rate === prev)
      const nextIndex = index >= 0 ? (index + 1) % playbackRateOptions.length : 0
      const nextRate = playbackRateOptions[nextIndex]
      if (playAudioRef.current) playAudioRef.current.playbackRate = nextRate
      return nextRate
    })
  }
  const play = async () => {
    const asset = post.audioAsset
    if (!asset) return
    if (!asset.storage_path || !asset.storage_bucket) {
      setAudioLoadError((p) => ({ ...p, [post.id]: 'この投稿には再生できる音声がありません。' }))
      setAudioLoadState((p) => ({ ...p, [post.id]: 'error' }))
      return
    }
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
    const previousAudio = playAudioRef.current
    if (previousAudio) {
      previousAudio.pause()
      previousAudio.ontimeupdate = null
      previousAudio.onpause = null
      previousAudio.onended = null
      previousAudio.onloadedmetadata = null
    }
    const nextAudio = new Audio()
    nextAudio.src = url
    const rawStartAt = audioCurrentTimeMap[post.id] ?? 0
    const startAt = Number.isFinite(rawStartAt) && rawStartAt > 0 ? rawStartAt : 0
    nextAudio.playbackRate = audioPlaybackRate
    nextAudio.onloadedmetadata = () => {
      const duration = nextAudio.duration
      if (Number.isFinite(duration) && duration > 0) {
        const safeStartAt = clampTime(startAt, duration)
        if (safeStartAt > 0) nextAudio.currentTime = safeStartAt
        updateTimeState(safeStartAt, duration)
      } else {
        updateTimeState(startAt)
      }
    }
    nextAudio.ontimeupdate = () => {
      const current = nextAudio.currentTime
      const duration = nextAudio.duration
      updateTimeState(Number.isFinite(current) ? current : 0, duration)
    }
    nextAudio.onpause = () => {
      setActiveAudioPostId((current) => (current === post.id ? null : current))
    }
    nextAudio.onended = () => {
      setActiveAudioPostId(null)
      setPlayingCurrentTimeSeconds(0)
      setAudioCurrentTimeMap((prev) => ({ ...prev, [post.id]: 0 }))
    }
    playAudioRef.current = nextAudio
    try {
      await nextAudio.play()
      setActiveAudioPostId(post.id)
      const duration = nextAudio.duration
      updateTimeState(startAt, duration)
      setAudioLoadState((p) => ({ ...p, [post.id]: 'ready' }))
    } catch (error) {
      const playError = error as Error & { name?: string; message?: string }
      console.error('audio play failed', {
        name: playError?.name ?? 'UnknownError',
        message: playError?.message ?? 'Unknown message',
        postId: post.id,
        url
      })
      setAudioLoadError((p) => ({ ...p, [post.id]: '再生できませんでした。もう一度タップしてください。' }))
      setActiveAudioPostId(null)
      setAudioLoadState((p) => ({ ...p, [post.id]: 'error' }))
    }
  }
  const hasPlayableAsset = Boolean(post.audioAsset?.storage_path && post.audioAsset?.storage_bucket)
  return <div className={`audio-card ${isPlaying ? 'is-active' : ''}`}><button className="audio-play audio-play-button" type="button" onClick={(event) => { event.stopPropagation(); void play() }} disabled={!hasPlayableAsset}><span className={`play-icon ${isPlaying ? 'is-stop' : ''}`}>{isPlaying ? '■' : '▷'}</span></button><div className="audio-main"><button type="button" className={`audio-wave ${isPlaying ? 'playing' : ''}`} onClick={(event) => { event.stopPropagation(); if (!canSeek) return; const rect = event.currentTarget.getBoundingClientRect(); const ratio = (event.clientX - rect.left) / rect.width; seekToRatio(Math.min(1, Math.max(0, ratio))) }} disabled={!canSeek} aria-label="波形をタップして再生位置を移動">{Array.from({ length: 18 }).map((_, i) => <i key={i} className={progressPercent >= ((i + 1) / 18) * 100 ? 'is-past' : ''} style={{ height: `${8 + ((i % 6) * 4)}px`, animationDelay: `${i * 0.05}s` }} />)}</button><div className="audio-meta-row"><span className="audio-duration">{durationLabel}</span>{isPlaying && <small className="audio-playing-label">再生中</small>}</div><div className="audio-seek-row"><button type="button" className="audio-seek-step" onClick={(event) => { event.stopPropagation(); seekBy(-15) }} disabled={!canSeek}>-15秒</button><button type="button" className="audio-speed-btn" onClick={(event) => { event.stopPropagation(); cyclePlaybackRate() }} aria-label={`再生速度 ${audioPlaybackRate.toFixed(1)}倍`}>{audioPlaybackRate.toFixed(1)}x</button><button type="button" className="audio-seek-step" onClick={(event) => { event.stopPropagation(); seekBy(15) }} disabled={!canSeek}>+15秒</button></div>{!canSeek && state === 'loading' && <small>再生準備中です...</small>}</div>{state === 'loading' && <small>読み込み中...</small>}{audioLoadError[post.id] && <small className="status-error">{audioLoadError[post.id]}</small>}</div>
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

useEffect(() => {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const inviteParam = normalizeInviteCode(params.get('invite') ?? '')
  if (inviteParam) writeLocalStorage(PENDING_INVITE_KEY, inviteParam)
  const pending = normalizeInviteCode(readLocalStorage(PENDING_INVITE_KEY) ?? '')
  if (!pending) return
  setPendingInviteCode(pending)
  setInviteCodeInput((prev) => prev || pending)
}, [])

useEffect(() => {
  if (postsStatus !== 'loaded') return
  const dismissed = readLocalStorage(WELCOME_DISMISSED_KEY) === '1'
  if (dismissed) {
    setShowWelcomeCard(false)
    return
  }
  const isFirstUse = posts.length === 0 && followingIds.size === 0
  setShowWelcomeCard(isFirstUse)
}, [postsStatus, posts.length, followingIds.size])

useEffect(() => { if (session?.user?.id) void loadMyInvites() }, [session?.user?.id])
useEffect(() => {
  if (!ENABLE_PROFILE_FOLLOW_COUNTS) {
    setProfileFollowListMode('posts')
    setProfileFollowListLoading(false)
    setProfileFollowListError('')
    setProfileFollowingUsers([])
    setProfileFollowerUsers([])
    setProfileFollowCounts({ following: 0, followers: 0 })
    return
  }
  const targetProfileId = viewingProfileId ?? session?.user?.id ?? ''
  if (screen !== 'profile' || !targetProfileId || !session?.user?.id) return
  void loadProfileFollowCounts(targetProfileId)
}, [screen, viewingProfileId, session?.user?.id, followingIds])
useEffect(() => {
  if (!ENABLE_PROFILE_FOLLOW_LISTS) {
    setProfileFollowingUsers([])
    setProfileFollowerUsers([])
    return
  }
  const targetProfileId = viewingProfileId ?? session?.user?.id ?? ''
  if (screen !== 'profile' || !targetProfileId || !session?.user?.id) return
  void loadProfileFollowLists(targetProfileId)
}, [screen, viewingProfileId, session?.user?.id, profileFollowListMode])
useEffect(() => {
  if (!ENABLE_PROFILE_FOLLOW_LISTS) {
    setMyFollowerIds(new Set())
    return
  }
  if (!session?.user?.id) return
  void loadMyFollowerIds()
}, [session?.user?.id, screen, profileFollowListMode, followingIds])

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


const loadProfileFollowCounts = async (targetProfileId: string) => {
  if (!ENABLE_PROFILE_FOLLOW_COUNTS || !sb || !session?.user?.id || !targetProfileId) return
  try {
    const [{ count: followingCount, error: followingErr }, { count: followerCount, error: followerErr }] = await Promise.all([
      sb.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', targetProfileId),
      sb.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', targetProfileId)
    ])
    if (followingErr || followerErr) {
      console.error('load profile follow counts failed', followingErr ?? followerErr)
      setProfileFollowListError('フォロー件数の取得に失敗しました。')
      setProfileFollowCounts({ following: 0, followers: 0 })
    } else {
      setProfileFollowCounts({ following: followingCount ?? 0, followers: followerCount ?? 0 })
    }
  } catch (error) {
    console.error('load profile follow counts failed', error)
    setProfileFollowListError('フォロー件数の取得に失敗しました。')
    setProfileFollowCounts({ following: 0, followers: 0 })
  }
}

const loadProfileFollowLists = async (targetProfileId: string) => {
  if (!ENABLE_PROFILE_FOLLOW_LISTS || !sb || !session?.user?.id || !targetProfileId) return
  setProfileFollowListLoading(true)
  setProfileFollowListError('')
  try {
    const [
      { data: followingRows, error: followingListError },
      { data: followerRows, error: followerListError }
    ] = await Promise.all([
      sb.from('follows').select('following_id').eq('follower_id', targetProfileId),
      sb.from('follows').select('follower_id').eq('following_id', targetProfileId)
    ])
    if (followingListError || followerListError) {
      console.error('load profile follow list ids failed', followingListError ?? followerListError)
      setProfileFollowListError('一覧を読み込めませんでした')
      setProfileFollowingUsers([])
      setProfileFollowerUsers([])
    } else {
      const followingIds = Array.from(new Set((followingRows ?? []).map((row) => row.following_id).filter((id): id is string => !!id)))
      const followerIds = Array.from(new Set((followerRows ?? []).map((row) => row.follower_id).filter((id): id is string => !!id)))
      const [
        { data: followingProfiles, error: followingProfilesError },
        { data: followerProfiles, error: followerProfilesError }
      ] = await Promise.all([
        followingIds.length > 0
          ? sb.from('profiles').select('id,username,display_name,avatar_url,bio').in('id', followingIds)
          : Promise.resolve({ data: [], error: null }),
        followerIds.length > 0
          ? sb.from('profiles').select('id,username,display_name,avatar_url,bio').in('id', followerIds)
          : Promise.resolve({ data: [], error: null })
      ])
      if (followingProfilesError || followerProfilesError) {
        console.error('load profile follow list profiles failed', followingProfilesError ?? followerProfilesError)
        setProfileFollowListError('一覧を読み込めませんでした')
        setProfileFollowingUsers([])
        setProfileFollowerUsers([])
      } else {
        setProfileFollowingUsers(Array.isArray(followingProfiles) ? followingProfiles : [])
        setProfileFollowerUsers(Array.isArray(followerProfiles) ? followerProfiles : [])
      }
    }
  } catch (error) {
    console.error('load profile follow lists failed', error)
    setProfileFollowListError('一覧を読み込めませんでした')
    setProfileFollowingUsers([])
    setProfileFollowerUsers([])
  } finally {
    setProfileFollowListLoading(false)
  }
}

const loadMyFollowerIds = async () => {
  if (!sb || !session?.user?.id) {
    setMyFollowerIds(new Set())
    return
  }
  try {
    const { data, error } = await sb.from('follows').select('follower_id').eq('following_id', session.user.id)
    if (error) {
      console.error('load my follower ids failed', error)
      setMyFollowerIds(new Set())
      return
    }
    const ids = Array.from(new Set((data ?? []).map((row) => row.follower_id).filter((id): id is string => !!id)))
    setMyFollowerIds(new Set(ids))
  } catch (error) {
    console.error('load my follower ids failed', error)
    setMyFollowerIds(new Set())
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
  if (openedCommentsPostId === postId) {
    if (voiceReplyRecordingPostId === postId) stopVoiceReplyRecorder()
    if (playingVoiceCommentId) stopVoiceCommentPlayback(true)
    return setOpenedCommentsPostId(null)
  }
  setCommentReplyModeByPostId((prev) => ({ ...prev, [postId]: prev[postId] ?? 'text' }))
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
    const { data, error } = await sb!.from('comments').insert({ post_id: postId, user_id: session.user.id, body, comment_type: 'text' }).select('id,post_id,user_id,body,created_at,comment_type,audio_url,audio_duration_seconds').single()
    if (error || !data) throw (error ?? new Error('insert failed'))
    const nextComment = { ...(data as CommentRow), comment_type: ((data as CommentRow).comment_type === 'voice' ? 'voice' : 'text') as CommentType, body: typeof (data as CommentRow).body === 'string' ? (data as CommentRow).body : '' } as CommentRow
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
    if (playingVoiceCommentId === comment.id) stopVoiceCommentPlayback(true)
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


function stopVoiceCommentPlayback(resetTime = false) {
  const audio = voiceCommentAudioRef.current
  if (audio) {
    audio.pause()
    audio.onended = null
    audio.ontimeupdate = null
    audio.onloadedmetadata = null
    audio.onerror = null
    if (resetTime) audio.currentTime = 0
  }
  voiceCommentAudioRef.current = null
  setPlayingVoiceCommentId(null)
}

const toggleVoiceCommentPlay = async (comment: CommentRow) => {
  const commentId = comment.id
  const audioUrl = comment.audio_url ?? ''
  if (!audioUrl) return
  if (playingVoiceCommentId === commentId) return stopVoiceCommentPlayback()
  stopVoiceCommentPlayback()
  stopVoiceReplyPreview(true)
  playAudioRef.current?.pause()
  setActiveAudioPostId(null)
  try {
    const audio = new Audio(audioUrl)
    voiceCommentAudioRef.current = audio
    audio.onloadedmetadata = () => setVoiceCommentDurationById((prev) => ({ ...prev, [commentId]: Number.isFinite(audio.duration) ? audio.duration : (comment.audio_duration_seconds ?? 0) }))
    audio.ontimeupdate = () => setVoiceCommentCurrentTimeById((prev) => ({ ...prev, [commentId]: audio.currentTime }))
    audio.onended = () => {
      setVoiceCommentCurrentTimeById((prev) => ({ ...prev, [commentId]: 0 }))
      stopVoiceCommentPlayback(true)
    }
    audio.onerror = () => {
      stopVoiceCommentPlayback(true)
    }
    await audio.play()
    setPlayingVoiceCommentId(commentId)
  } catch (error) {
    console.error('voice comment play failed', error)
    stopVoiceCommentPlayback(true)
  }
}

const handleCreateVoiceComment = async (postId: string) => {
  if (voiceCommentPostingMap[postId]) return
  const userId = session?.user?.id ?? ''
  const blob = voiceReplyBlobByPostId[postId]
  const VOICE_BUCKET = 'voice-posts'

  if (!userId) {
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: 'ログイン情報を確認できません。再度お試しください。' }))
    return
  }
  if (!postId) {
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: '投稿IDが取得できないため送信できませんでした。' }))
    return
  }
  if (!blob) {
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: '録音済みデータが見つかりません。録音してから送信してください。' }))
    return
  }
  if (blob.size === 0) {
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: '録音データが空です。再録音してから送信してください。' }))
    return
  }
  if (!sb) {
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: '接続情報の初期化に失敗しました。時間をおいて再試行してください。' }))
    return
  }
  if (!VOICE_BUCKET) {
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: '保存先の設定が不正です。管理者にお問い合わせください。' }))
    return
  }

  setVoiceCommentPostingMap((prev) => ({ ...prev, [postId]: true }))
  setCommentsErrorMap((prev) => ({ ...prev, [postId]: '' }))
  setVoiceReplySuccessByPostId((prev) => ({ ...prev, [postId]: '' }))
  try {
    const ext = (blob.type.split('/')[1] || 'webm').replace('x-', '') || 'webm'
    const filePath = `${userId}/comments/${postId}/reply-${Date.now()}.${ext}`
    const contentType = blob.type || 'audio/webm'

    if (!filePath) {
      setCommentsErrorMap((prev) => ({ ...prev, [postId]: '保存パスの生成に失敗しました。再度お試しください。' }))
      return
    }

    const { error: uploadError } = await sb.storage.from(VOICE_BUCKET).upload(filePath, blob, { contentType, upsert: false })
    if (uploadError) {
      console.error('Voice reply upload failed', {
        bucket: VOICE_BUCKET,
        path: filePath,
        blobType: blob.type,
        blobSize: blob.size,
        errorMessage: uploadError.message,
        errorStatusCode: (uploadError as { statusCode?: string | number }).statusCode,
        errorStatus: (uploadError as { status?: string | number }).status,
        error: uploadError,
      })
      setCommentsErrorMap((prev) => ({ ...prev, [postId]: '音声返信のアップロードに失敗しました。' }))
      return
    }
    const { data: signedData, error: signedError } = await sb.storage.from(VOICE_BUCKET).createSignedUrl(filePath, 60 * 60 * 24 * 30)
    if (signedError || !signedData?.signedUrl) throw (signedError ?? new Error('signed url failed'))
    if (!signedData.signedUrl) {
      setCommentsErrorMap((prev) => ({ ...prev, [postId]: '音声返信URLの生成に失敗しました。再度お試しください。' }))
      return
    }

    const durationSeconds = Math.max(1, Math.round((voiceReplyDurationByPostId[postId] ?? 0) / 1000))
    const { data, error } = await sb.from('comments').insert({ post_id: postId, user_id: userId, body: '', comment_type: 'voice', audio_url: signedData.signedUrl, audio_duration_seconds: durationSeconds }).select('id,post_id,user_id,body,created_at,comment_type,audio_url,audio_duration_seconds').single()
    if (error || !data) throw (error ?? new Error('voice comment insert failed'))
    const nextComment = { ...(data as CommentRow), comment_type: 'voice' as CommentType, body: typeof (data as CommentRow).body === 'string' ? (data as CommentRow).body : '' }
    setCommentsByPostId((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), nextComment] }))
    setCommentsCountMap((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }))
    clearVoiceReplyForPost(postId)
    setVoiceReplyErrorByPostId((prev) => ({ ...prev, [postId]: '' }))
    setVoiceReplySuccessByPostId((prev) => ({ ...prev, [postId]: '音声返信を送信しました。' }))
    setCommentReplyModeByPostId((prev) => ({ ...prev, [postId]: 'voice' }))
  } catch (error) {
    console.error('voice comment post failed', error)
    setCommentsErrorMap((prev) => ({ ...prev, [postId]: toFriendlyError('comment_post') }))
  } finally {
    setVoiceCommentPostingMap((prev) => ({ ...prev, [postId]: false }))
  }
}

const loadMyInvites = async () => {
  if (!sb || !session?.user?.id) return
  const { data, error } = await sb.from('invites').select('id,inviter_id,code,used_by,used_at,created_at,expires_at,status').eq('inviter_id', session.user.id).order('created_at', { ascending: false })
  if (error) {
    console.error('load invites failed', error)
    setInviteActionError('招待コード一覧の取得に失敗しました。時間をおいて再試行してください。')
    setMyInvites([])
    return
  }
  setInviteActionError('')
  setMyInvites(Array.isArray(data) ? (data as InviteRow[]) : [])
}

const createInviteCode = async () => {
  if (!sb || !session?.user?.id || isInviteCreating) return
  setIsInviteCreating(true); setInviteActionError(''); setInviteActionMessage('')
  for (let i = 0; i < 5; i += 1) {
    const code = generateInviteCode()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await sb.from('invites').insert({ inviter_id: session.user.id, code, status: 'active', expires_at: expiresAt })
    if (!error) {
      setInviteActionMessage('招待コードを作成しました。')
      await loadMyInvites()
      setIsInviteCreating(false)
      return
    }
  }
  setInviteActionError('招待コード作成に失敗しました。時間をおいて再試行してください。')
  setIsInviteCreating(false)
}


const revokeInviteCode = async (invite: InviteRow) => {
  if (!sb || !session?.user?.id || invite.status !== 'active' || inviteRevokingMap[invite.id]) return
  if (!window.confirm('この招待コードを取り消しますか？')) return

  setInviteRevokingMap((prev) => ({ ...prev, [invite.id]: true }))
  setInviteActionError('')
  setInviteActionMessage('')

  const { error } = await sb
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', invite.id)
    .eq('inviter_id', session.user.id)
    .eq('status', 'active')

  if (error) {
    console.error('revoke invite failed', error)
    setInviteActionError('招待コードの取り消しに失敗しました。')
    setInviteRevokingMap((prev) => ({ ...prev, [invite.id]: false }))
    return
  }

  setMyInvites((prev) => prev.map((item) => (item.id === invite.id ? { ...item, status: 'revoked' } : item)))
  setInviteActionMessage('招待コードを取り消しました。')
  setInviteRevokingMap((prev) => ({ ...prev, [invite.id]: false }))
}

const copyText = async (text: string, message: string) => {
  try {
    await navigator.clipboard.writeText(text)
    setInviteActionError('')
    setInviteActionMessage(message)
  } catch { setInviteActionError('コピーに失敗しました。') }
}

const addInviterToCloseFriends = async () => {
  if (!sb || !session?.user?.id || !inviteCloseFriendCard || inviteCloseFriendPending) return
  const me = session.user.id
  const inviterId = inviteCloseFriendCard.inviterId
  if (!inviterId || inviterId === me) return
  setInviteCloseFriendPending(true)
  setInviteCloseFriendError('')
  try {
    const { error } = await sb.from('close_friends').upsert({ owner_id: me, friend_id: inviterId }, { onConflict: 'owner_id,friend_id', ignoreDuplicates: true })
    if (error) throw error
    setCloseFriendIds((prev) => new Set(prev).add(inviterId))
    setInviteCloseFriendCard((prev) => prev ? { ...prev, added: true } : prev)
  } catch (error) {
    console.error('invite close friend upsert failed', error)
    setInviteCloseFriendError('親しい友達への追加に失敗しました。時間をおいて再度お試しください。')
  } finally {
    setInviteCloseFriendPending(false)
  }
}

const useInviteCode = async (rawCode?: string) => {
  if (!sb || !session?.user?.id || isInviteUsing) return
  const code = normalizeInviteCode(rawCode ?? inviteCodeInput)
  if (!code) return setInviteActionError('招待コードを入力してください。')
  setIsInviteUsing(true); setInviteActionError(''); setInviteActionMessage(''); setInviteSuccessNotice(''); setInviteCloseFriendError('')
  const { data, error } = await sb.from('invites').select('id,inviter_id,code,status,used_by').eq('code', code).maybeSingle()
  if (error || !data) { setInviteActionError('招待コードが見つかりません。'); setIsInviteUsing(false); return }
  if (data.inviter_id === session.user.id) { setInviteActionError('自分の招待コードは使えません。'); setIsInviteUsing(false); return }
  if (data.status !== 'active' || data.used_by) {
    if (data.status === 'revoked') setInviteActionError('この招待コードは取り消されています。')
    else if (data.status === 'expired') setInviteActionError('この招待コードは期限切れです。')
    else setInviteActionError('この招待コードは使用済みです。')
    setIsInviteUsing(false)
    return
  }
  const { error: upErr } = await sb.from('invites').update({ used_by: session.user.id, used_at: new Date().toISOString(), status: 'used' }).eq('id', data.id).eq('status', 'active').is('used_by', null)
  if (upErr) { setInviteActionError('招待コードの利用に失敗しました。'); setIsInviteUsing(false); return }
  if (data.inviter_id !== session.user.id) {
    const { error: followErr } = await sb.from('follows').upsert({ follower_id: session.user.id, following_id: data.inviter_id }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true })
    if (followErr) {
      console.error('invite follow upsert failed', followErr)
      setInviteActionError('招待コードは使用しましたが、フォロー処理に失敗しました。')
      setIsInviteUsing(false)
      return
    }
    setFollowingIds((prev) => new Set(prev).add(data.inviter_id))
  }
  let inviterName = '招待してくれた友達'
  let inviterAvatarUrl = ''
  try {
    const knownProfile = profileMap[data.inviter_id] ?? discoverUsers.find((user) => user.id === data.inviter_id)
    if (knownProfile) {
      inviterName = knownProfile.display_name ?? knownProfile.username ?? inviterName
      inviterAvatarUrl = knownProfile.avatar_url ?? ''
    } else {
      const { data: inviterProfile, error: inviterProfileError } = await sb.from('profiles').select('id,display_name,username,avatar_url').eq('id', data.inviter_id).maybeSingle()
      if (inviterProfileError) console.error('inviter profile fetch failed', inviterProfileError)
      if (inviterProfile) {
        inviterName = inviterProfile.display_name ?? inviterProfile.username ?? inviterName
        inviterAvatarUrl = inviterProfile.avatar_url ?? ''
      }
    }
  } catch (error) {
    console.error('resolve inviter profile failed', error)
  }
  setInviteCodeInput('')
  removeLocalStorage(PENDING_INVITE_KEY)
  setPendingInviteCode('')
  setInviteActionMessage('招待コードを利用しました。招待者をフォローしました。')
  setInviteSuccessNotice('招待コードを使いました。招待してくれた友達をフォローしました。')
  setInviteCloseFriendCard({ inviterId: data.inviter_id, inviterName, inviterAvatarUrl, added: closeFriendIds.has(data.inviter_id) })
  setIsInviteUsing(false)
}

const visibleInvites = myInvites.filter((invite) => invite.status !== 'revoked')
const toActivityPostPreview = (postId: string) => { const post = posts.find((item) => item.id === postId); if (!post) return '削除済みの投稿'; const text = (post.text ?? '').trim(); if (text) return text.slice(0, 30); return post.audioAsset ? '音声投稿' : '投稿'; }
const loadActivities = async () => {
  if (!sb || !session?.user?.id) { setActivityItems([]); return }
  setActivityLoading(true); setActivityError('')
  try {
    const myId = session.user.id
    const myPostIds = posts.filter((post) => post.user_id === myId).map((post) => post.id)
    const [commentsRes, likesRes, repostsRes, followsRes, invitesRes] = await Promise.all([
      myPostIds.length ? sb.from('comments').select('id,post_id,user_id,body,created_at,comment_type').in('post_id', myPostIds).neq('user_id', myId).order('created_at',{ascending:false}).limit(20) : Promise.resolve({ data: [], error: null }),
      myPostIds.length ? sb.from('post_likes').select('post_id,user_id,created_at').in('post_id', myPostIds).neq('user_id', myId).order('created_at',{ascending:false}).limit(20) : Promise.resolve({ data: [], error: null }),
      myPostIds.length ? sb.from('post_reposts').select('post_id,user_id,created_at').in('post_id', myPostIds).neq('user_id', myId).order('created_at',{ascending:false}).limit(20) : Promise.resolve({ data: [], error: null }),
      sb.from('follows').select('follower_id,created_at').eq('following_id', myId).order('created_at',{ascending:false}).limit(20),
      sb.from('invites').select('id,code,used_by,used_at').eq('inviter_id', myId).not('used_by','is',null).order('used_at',{ascending:false}).limit(20)
    ])
    const errors = [commentsRes.error, likesRes.error, repostsRes.error, followsRes.error, invitesRes.error].filter(Boolean)
    if (errors.length) { console.error('activity fetch failed', errors); setActivityError('一部のアクティビティを読み込めませんでした') }
    const actorIds = Array.from(new Set([...(commentsRes.data ?? []).map((row) => row.user_id), ...(likesRes.data ?? []).map((row) => row.user_id), ...(repostsRes.data ?? []).map((row) => row.user_id), ...(followsRes.data ?? []).map((row) => row.follower_id), ...(invitesRes.data ?? []).map((row) => row.used_by).filter(Boolean)]))
    const actors: Record<string, Profile> = {}
    if (actorIds.length) { const { data, error } = await sb.from('profiles').select('id,username,display_name,avatar_url,bio').in('id', actorIds); if (error) console.error('activity profiles fetch failed', error); (data ?? []).forEach((row) => { actors[row.id] = row as Profile }) }
    const fallbackActor: Profile = { id: 'unknown', username: 'user', display_name: 'friendcast user', avatar_url: null, bio: '' }
    const safeDate = (value: unknown) => (typeof value === 'string' && value ? value : new Date(0).toISOString())
    const items: ActivityItem[] = [
      ...(commentsRes.data ?? []).filter((row) => !!row?.user_id && !!row?.post_id).map((row) => ({ id: `comment_${row.id ?? `${row.post_id}_${row.user_id}`}`, type: 'comment' as const, actor: actors[row.user_id] ?? { ...fallbackActor, id: row.user_id }, postId: row.post_id, postPreview: String(toActivityPostPreview(row.post_id) ?? ''), body: String(row.body ?? ''), commentType: (row.comment_type === 'voice' ? 'voice' : 'text') as CommentType, createdAt: safeDate(row.created_at) })),
      ...(likesRes.data ?? []).filter((row) => !!row?.user_id && !!row?.post_id).map((row) => ({ id: `like_${row.post_id}_${row.user_id}`, type: 'like' as const, actor: actors[row.user_id] ?? { ...fallbackActor, id: row.user_id }, postId: row.post_id, postPreview: String(toActivityPostPreview(row.post_id) ?? ''), createdAt: safeDate(row.created_at) })),
      ...(repostsRes.data ?? []).filter((row) => !!row?.user_id && !!row?.post_id).map((row) => ({ id: `repost_${row.post_id}_${row.user_id}`, type: 'repost' as const, actor: actors[row.user_id] ?? { ...fallbackActor, id: row.user_id }, postId: row.post_id, postPreview: String(toActivityPostPreview(row.post_id) ?? ''), createdAt: safeDate(row.created_at) })),
      ...(followsRes.data ?? []).filter((row) => !!row?.follower_id).map((row) => ({ id: `follow_${row.follower_id}_${safeDate(row.created_at)}`, type: 'follow' as const, actor: actors[row.follower_id] ?? { ...fallbackActor, id: row.follower_id }, createdAt: safeDate(row.created_at) })),
      ...(invitesRes.data ?? []).filter((row) => !!row?.used_by).map((row) => ({ id: `invite_${row.id}`, type: 'invite_used' as const, actor: actors[row.used_by as string] ?? { ...fallbackActor, id: row.used_by as string }, code: String(row.code ?? ''), createdAt: safeDate(row.used_at) }))
    ].filter((item) => !!item?.actor?.id && !!item?.createdAt).sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')).slice(0, 20)
    setActivityItems(items)
  } catch (error) { console.error('activity fetch exception', error); setActivityError('アクティビティを読み込めませんでした') } finally { setActivityLoading(false) }
}
const activityMessage = (item: ActivityItem) => item.type === 'comment' ? (item.commentType === 'voice' ? '🎙️ あなたの投稿に音声返信が届きました' : 'あなたの投稿にコメントしました') : item.type === 'like' ? 'あなたの投稿にいいねしました' : item.type === 'repost' ? 'あなたの投稿をリポストしました' : item.type === 'follow' ? 'あなたをフォローしました' : '招待コードを使いました'


const renderTimelinePost = (post: Post, options?: { compact?: boolean; showFollowButton?: boolean; repostMeta?: { repostedBy: Profile; repostedAt: string }; detailed?: boolean }) => { const compact = options?.compact ?? false; const detailed = options?.detailed ?? false; const showFollowButton = options?.showFollowButton ?? false; const repostMeta = options?.repostMeta; const authorProfile = resolvePostAuthor(post); const isOwnPost = post.user_id === session?.user.id; const displayName = authorProfile?.display_name ?? authorProfile?.username ?? 'friendcast user'; const isCommentsOpen = detailed || openedCommentsPostId === post.id; const comments = commentsByPostId[post.id] ?? []; const commentDraft = commentInputMap[post.id] ?? ''; const commentBody = commentDraft.trim(); const isCommentSubmitting = !!commentPostingMap[post.id]; const canSubmitComment = !!session?.user && !!post.id && commentBody.length > 0 && commentBody.length <= 140 && !isCommentSubmitting; return <article key={`${post.id}_${repostMeta?.repostedBy.id ?? 'post'}`} className={`post-card tweet-item ${detailed ? 'post-card-detail' : ''}`} role="article">{repostMeta && <button type="button" className="repost-meta" onClick={(event) => { event.stopPropagation(); goToProfile(repostMeta.repostedBy.id) }}>↻ {repostMeta.repostedBy.display_name ?? repostMeta.repostedBy.username}さんがリポストしました ・ {formatDate(repostMeta.repostedAt)}</button>}<div className="post-header"><button className="post-avatar tweet-avatar" onClick={(event) => { event.stopPropagation(); goToProfile(post.user_id) }} style={authorProfile?.avatar_url ? { backgroundImage: `url(${authorProfile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{displayName.slice(0, 1)}</button><div className="post-header-main"><button className="tweet-header author-link tweet-author-link" onClick={(event) => { event.stopPropagation(); goToProfile(post.user_id) }} type="button"><div className="post-user-line"><span className="post-user-name">{displayName}</span></div></button><time className="post-date">{formatDate(post.created_at)}</time></div><div className="post-header-actions">{showFollowButton && !isOwnPost && <button className={`follow-btn ${isFollowing(post.user_id) ? 'is-following' : ''}`} disabled={isFollowPending(post.user_id)} onClick={() => void toggleFollow(post.user_id)} type="button">{isFollowPending(post.user_id) ? '処理中...' : (isFollowing(post.user_id) ? 'フォロー中' : 'フォロー')}</button>}<div className="visibility-badge"><span>{visibilityBadgeIcon[post.visibility]}</span><span>{visibilityComposeLabel[post.visibility]}</span></div>{isOwnPost && <button className="post-delete-btn post-delete-button" aria-label="投稿を削除" disabled={deletingPostId === post.id} onClick={(event) => { event.stopPropagation(); void handleDeletePost(post) }}>{deletingPostId === post.id ? '…' : '🗑️'}</button>}</div></div><div className="post-content tweet-content"><p className="post-text tweet-text">{post.text}</p>{renderAudioPlayer(post)}{postActionError[post.id] && <p className="inline-error">{postActionError[post.id]}</p>}{!compact && <p className="post-sub-text delivery-inline"><small>{audienceLabel[post.visibility]}に届きます</small></p>}</div><div className="post-actions action-row"><button className="icon-btn" onClick={(event) => { event.stopPropagation(); void toggleCommentsPanel(post.id) }}>💬 <span>{commentsCountMap[post.id] ?? 0}</span></button><button className={`icon-btn repost-btn ${isRepostedPost(post.id) ? 'active-icon reposted' : ''}`} onClick={(event) => { event.stopPropagation(); void togglePostRepost(post.id) }} disabled={isRepostPending(post.id)} aria-pressed={isRepostedPost(post.id)}>🔁 <span>{repostsCountMap[post.id] ?? 0}</span></button><button className={`icon-btn like-btn ${isLikedPost(post.id) ? 'active-icon liked' : ''}`} onClick={(event) => { event.stopPropagation(); void togglePostLike(post.id) }} disabled={isLikePending(post.id)} aria-pressed={isLikedPost(post.id)}>{isLikedPost(post.id) ? '♥' : '♡'} <span>{likesCountMap[post.id] ?? 0}</span></button><button className={`icon-btn ${savedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={(event) => { event.stopPropagation(); setSavedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id]) }}><ShareIcon /></button></div>{isCommentsOpen && <section className="comments-panel"><div className="comment-reply-tabs"><button type="button" className={`comment-reply-tab ${(commentReplyModeByPostId[post.id] ?? 'text') === 'text' ? 'active-tab' : ''}`} onClick={(event) => { event.stopPropagation(); setCommentReplyModeByPostId((prev) => ({ ...prev, [post.id]: 'text' })) }}>テキスト</button><button type="button" className={`comment-reply-tab ${(commentReplyModeByPostId[post.id] ?? 'text') === 'voice' ? 'active-tab' : ''}`} onClick={(event) => { event.stopPropagation(); setCommentReplyModeByPostId((prev) => ({ ...prev, [post.id]: 'voice' })) }}>音声</button></div>{(commentReplyModeByPostId[post.id] ?? 'text') === 'text' ? <div className="comment-input-row"><textarea maxLength={140} value={commentDraft} onChange={(event) => setCommentInputMap((prev) => ({ ...prev, [post.id]: event.target.value }))} placeholder="コメントを書く..." className="compose-textarea" rows={2} /><div className="compose-sticky-action"><p className="compose-counter">{commentDraft.length} / 140</p><button className={`compose-post-btn comment-submit-btn ${canSubmitComment ? 'is-enabled' : 'is-disabled'}`} type="button" disabled={!canSubmitComment} aria-disabled={!canSubmitComment} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void handleCreateComment(post.id) }}>{isCommentSubmitting ? '送信中...' : '送信'}</button></div></div> : <div className="voice-reply-panel"><p className="status-message">音声で返信</p><p className="status-message">{voiceReplyRecordingPostId === post.id ? `録音中：${formatDuration((voiceReplyRecordingSecondsByPostId[post.id] ?? 0) * 1000)} / ${formatDuration(MAX_VOICE_REPLY_MS)}` : (voiceReplyBlobByPostId[post.id] ? `録音済み：${formatDuration(voiceReplyDurationByPostId[post.id] ?? 0)}` : 'まだ録音されていません')}</p>{voiceReplyPreviewUrlByPostId[post.id] && <div className="voice-reply-preview-box"><p className="voice-reply-preview-time">{formatDuration((voiceReplyPreviewCurrentTimeByPostId[post.id] ?? 0) * 1000)} / {formatDuration(voiceReplyDurationByPostId[post.id] ?? 0)}</p><div className="voice-reply-actions"><button type="button" className="follow-btn" onClick={(event) => { event.stopPropagation(); void playVoiceReplyPreview(post.id) }}>{voiceReplyPreviewPlayingPostId === post.id ? '停止' : '▶ 再生'}</button><button type="button" className="soft-action-button" onClick={(event) => { event.stopPropagation(); clearVoiceReplyForPost(post.id) }} disabled={voiceReplyRecordingPostId === post.id}>再録音</button></div></div>}<div className="voice-reply-actions">{voiceReplyRecordingPostId === post.id ? <button type="button" className="follow-btn" onClick={(event) => { event.stopPropagation(); stopVoiceReplyRecording(post.id) }}>停止</button> : <button type="button" className="follow-btn" onClick={(event) => { event.stopPropagation(); void startVoiceReplyRecording(post.id) }} disabled={!isRecordSupported || !!voiceReplyRecordingPostId}>録音開始</button>}</div><button type="button" className={`compose-post-btn comment-submit-btn ${(voiceReplyBlobByPostId[post.id] && !voiceCommentPostingMap[post.id]) ? 'is-enabled' : 'is-disabled'}`} disabled={!voiceReplyBlobByPostId[post.id] || !!voiceCommentPostingMap[post.id]} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void handleCreateVoiceComment(post.id) }}>{voiceCommentPostingMap[post.id] ? '送信中...' : '音声返信を送信'}</button>{voiceReplyErrorByPostId[post.id] && <p className="inline-error">{voiceReplyErrorByPostId[post.id]}</p>}{voiceReplySuccessByPostId[post.id] && <p className="status-message voice-reply-success">{voiceReplySuccessByPostId[post.id]}</p>}{!isRecordSupported && <p className="inline-error">このブラウザでは録音に対応していません</p>}</div>}{commentsErrorMap[post.id] && <p className="inline-error">{commentsErrorMap[post.id]}</p>}{commentsLoadingMap[post.id] && <p className="status-message">コメントを読み込み中...</p>}{!commentsLoadingMap[post.id] && comments.length === 0 && <p className="status-message">まだコメントはありません</p>}{!commentsLoadingMap[post.id] && comments.length > 0 && <div>{comments.map((comment) => { const cProfile = commentProfileMap[comment.user_id]; const cName = cProfile?.display_name ?? cProfile?.username ?? 'friendcast user'; const isOwnComment = comment.user_id === session?.user.id; const isVoice = comment.comment_type === 'voice'; const isPlaying = playingVoiceCommentId === comment.id; const currentLabel = formatDurationSeconds(voiceCommentCurrentTimeById[comment.id] ?? (isPlaying ? 0 : null), '0:00'); const totalLabel = formatDurationSeconds((voiceCommentDurationById[comment.id] ?? comment.audio_duration_seconds ?? null), '--:--'); return <article key={comment.id} className={`discover-user-item comment-item ${isVoice ? 'comment-item-voice' : ''} ${isPlaying ? 'is-playing' : ''}`}><span className="discover-user-main"><span className="discover-avatar" style={cProfile?.avatar_url ? { backgroundImage: `url(${cProfile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(cName)}</span><span className="discover-user-meta"><strong>{cName}</strong><small>{formatDate(comment.created_at)}</small>{isVoice ? <span className="voice-comment-wrap"><small className="voice-comment-tag">🎙️ 音声返信</small>{comment.audio_url ? <span className="voice-comment-player"><button type="button" className={`follow-btn voice-comment-play-btn ${isPlaying ? 'is-playing' : ''}`} onClick={(event) => { event.stopPropagation(); void toggleVoiceCommentPlay(comment) }}>{isPlaying ? '⏸ 一時停止' : '▶ 再生'}</button><small className="voice-comment-time">{currentLabel} / {totalLabel}</small>{isPlaying && <small className="voice-comment-live">再生中</small>}</span> : <small>音声を読み込めません</small>}</span> : <span className="comment-body-text">{typeof comment.body === 'string' ? comment.body : ''}</span>}</span></span>{isOwnComment && <button type="button" className="post-delete-btn comment-delete-btn" aria-label="コメントを削除" disabled={commentDeletingMap[comment.id]} onClick={(event) => { event.stopPropagation(); void handleDeleteComment(post.id, comment) }}>{commentDeletingMap[comment.id] ? '…' : '🗑️'}</button>}</article> })}</div>}</section>}</article> }

return <div className={`app-shell theme-${resolvedTheme}`}><main className="screen">{screen === 'home' && <section className="screen-home"><header className="home-mobile-header"><div className="home-side-slot"><button className="mini-avatar" onClick={() => { setViewingProfileId(session.user.id); goToScreen('profile') }} style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(profileName)}</button></div><div className="home-brand-slot"><FriendcastLogo /></div><div className="home-side-slot" aria-hidden="true"><span className="header-spacer" /></div></header>{showWelcomeCard && <article className="onboarding-card"><div><strong>ようこそ、friendcastへ</strong><p>ここは、招待した友達とだけ声や近況を共有できる場所です。</p><ol><li>友達をフォローする</li><li>声や近況を投稿する</li><li>公開範囲を選んで届ける</li></ol></div><button type="button" className="soft-action-button" onClick={() => { setShowWelcomeCard(false); writeLocalStorage(WELCOME_DISMISSED_KEY, '1') }}>閉じる</button></article>}{pendingInviteCode && <article className="invite-pending-card"><strong>招待コードを受け取りました</strong><p>このコードを使うと、招待してくれた友達をフォローできます。</p><div className="empty-state-actions"><button type="button" className="soft-action-button" onClick={() => void useInviteCode(pendingInviteCode)} disabled={isInviteUsing}>{isInviteUsing ? '処理中...' : '招待コードを使う'}</button><button type="button" className="soft-action-button" onClick={() => goToScreen('settings')}>設定で確認</button></div></article>}{inviteSuccessNotice && <article className="invite-pending-card"><strong>{inviteSuccessNotice}</strong><div className="empty-state-actions"><button type="button" className="soft-action-button" onClick={() => { setInviteSuccessNotice(''); goToScreen('home') }}>ホームを見る</button><button type="button" className="soft-action-button" onClick={() => { setInviteSuccessNotice(''); goToScreen('compose') }}>自分も投稿する</button></div></article>}{inviteCloseFriendCard && <article className="invite-pending-card invite-close-friend-card"><strong>親しい友達にも追加しますか？</strong><div className="invite-close-friend-row"><span className="discover-avatar" style={inviteCloseFriendCard.inviterAvatarUrl ? { backgroundImage: `url(${inviteCloseFriendCard.inviterAvatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(inviteCloseFriendCard.inviterName)}</span><p>{inviteCloseFriendCard.inviterName}さんをフォローしました。</p></div>{inviteCloseFriendError && <p className="status-message status-error">{inviteCloseFriendError}</p>}<div className="empty-state-actions"><button type="button" className="follow-btn invite-close-friend-add-btn" onClick={() => void addInviterToCloseFriends()} disabled={inviteCloseFriendPending || inviteCloseFriendCard.added}>{inviteCloseFriendPending ? '追加中...' : (inviteCloseFriendCard.added ? '追加済み' : '親しい友達に追加')}</button><button type="button" className="soft-action-button" onClick={() => { setInviteCloseFriendCard(null); setInviteCloseFriendError('') }}>あとで</button></div></article>}{postsStatus === 'error' && <p className="status-message status-error">{postsError}</p>}{postsStatus === 'loading' && <p className="status-message">投稿を読み込み中です...</p>}{followActionError && <p className="status-message status-error">{followActionError}</p>}{homePosts.length === 0 && postsStatus !== 'loading' && <article className="empty-state-card"><strong>まだタイムラインに声がありません</strong><p>友達をフォローするか、最初の声を投稿してみましょう。</p><div className="empty-state-actions"><button type="button" className="soft-action-button" onClick={() => goToScreen('compose')}>声を投稿する</button><button type="button" className="soft-action-button" onClick={() => goToScreen('search')}>友達を探す</button><button type="button" className="soft-action-button" onClick={() => goToScreen('settings')}>友達を招待する</button></div></article>}{homePosts.length > 0 && followingIds.size === 0 && <article className="empty-state-card"><strong>まだフォロー中の友達はいません</strong><p>友達を検索するか、招待コードを送ってfriendcastに呼んでみましょう。</p><div className="empty-state-actions"><button type="button" className="soft-action-button" onClick={() => goToScreen('search')}>友達を探す</button><button type="button" className="soft-action-button" onClick={() => goToScreen('settings')}>招待する</button></div></article>}{homePosts.length > 0 && !hasFollowingPosts && followingIds.size > 0 && <div className="discover-guide"><p>フォロー中のユーザーの投稿はまだありません。検索から友達をフォローしてみましょう。</p><button type="button" onClick={() => goToScreen('search')}>ユーザーを探す</button></div>}<div className="timeline-list">{homeTimelineItems.map((item) => item.type === 'post' ? renderTimelinePost(item.post) : renderTimelinePost(item.post, { repostMeta: { repostedBy: item.repostedBy, repostedAt: item.reposted_at } }))}</div></section>}{screen === 'profile' && <section className="profile-screen"><div className="profile-block"><div className="profile-top-row"><div className="profile-photo" style={viewedProfile?.avatar_url ? { backgroundImage: `url(${viewedProfile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(viewedProfile?.display_name ?? viewedProfile?.username ?? 'U')}</div>{isOwnProfile ? <button className="profile-edit-btn" type="button" onClick={openProfileEditor}>プロフィールを編集</button> : <button className={`profile-edit-btn ${activeProfileId && isFollowing(activeProfileId) ? 'is-following' : ''}`} disabled={!activeProfileId || isFollowPending(activeProfileId)} onClick={() => activeProfileId && void toggleFollow(activeProfileId)}>{activeProfileId && isFollowPending(activeProfileId) ? '処理中...' : (activeProfileId && isFollowing(activeProfileId) ? 'フォロー中' : 'フォロー')}</button>}</div><h3 className="profile-name">{viewedProfile?.display_name ?? 'friendcast user'}</h3><p className="profile-id">{viewedProfile?.username ? `@${viewedProfile.username}` : '@user'}</p><p className="profile-bio">{viewedProfile?.bio || '自己紹介はまだありません。'}</p>{isOwnProfile && isEditingProfile && <div className="profile-edit-panel"><div className="profile-edit-avatar" style={profileEditAvatarPreview ? { backgroundImage: `url(${profileEditAvatarPreview})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(profileEditForm.display_name || profileEditForm.username || 'U')}</div><label>表示名<input type="text" maxLength={30} value={profileEditForm.display_name} onChange={(event) => { setProfileEditForm((prev) => ({ ...prev, display_name: event.target.value })); setProfileEditErrors((prev) => ({ ...prev, display_name: '' })) }} /></label>{profileEditErrors.display_name && <p className="inline-error">{profileEditErrors.display_name}</p>}<label>ユーザー名<input type="text" maxLength={30} value={profileEditForm.username} onChange={(event) => { setProfileEditForm((prev) => ({ ...prev, username: event.target.value })); setProfileEditErrors((prev) => ({ ...prev, username: '' })) }} /></label>{profileEditErrors.username && <p className="inline-error">{profileEditErrors.username}</p>}<label>自己紹介<textarea rows={3} maxLength={160} value={profileEditForm.bio} onChange={(event) => { setProfileEditForm((prev) => ({ ...prev, bio: event.target.value })); setProfileEditErrors((prev) => ({ ...prev, bio: '' })) }} /></label>{profileEditErrors.bio && <p className="inline-error">{profileEditErrors.bio}</p>}<div><input ref={avatarFileInputRef} type="file" accept="image/*" onChange={handleAvatarFileChange} style={{ display: 'none' }} /><button type="button" onClick={openAvatarPicker} disabled={isSavingProfile}>写真を選ぶ</button><p className="status-message">{selectedAvatarFile ? `画像を選択済み: ${selectedAvatarFile.name}` : '画像はまだ選択されていません'}</p>{selectedAvatarFile && <button type="button" onClick={clearSelectedAvatarFile} disabled={isSavingProfile}>選択を解除</button>}</div><label>アイコン画像URL<input type="url" value={profileEditForm.avatar_url} onChange={(event) => { setProfileEditForm((prev) => ({ ...prev, avatar_url: event.target.value })); setProfileEditErrors((prev) => ({ ...prev, avatar_url: '' })) }} placeholder="https://example.com/avatar.jpg" /></label>{profileEditErrors.avatar_url && <p className="inline-error">{profileEditErrors.avatar_url}</p>}{profileEditMessage && <p className="status-message">{profileEditMessage}</p>}<div className="profile-edit-actions"><button type="button" onClick={() => void saveProfileEdit()} disabled={isSavingProfile}>{isSavingProfile ? '保存中...' : '保存'}</button><button type="button" onClick={closeProfileEditor} disabled={isSavingProfile}>キャンセル</button></div></div>}</div><div className="profile-follow-stats"><button type="button" className={`profile-follow-stat ${profileFollowListMode === 'following' ? 'is-active' : ''}`} onClick={() => setProfileFollowListMode('following')} aria-pressed={profileFollowListMode === 'following'}><span>フォロー中</span><strong>{profileFollowCounts?.following ?? 0}</strong></button><button type="button" className={`profile-follow-stat ${profileFollowListMode === 'followers' ? 'is-active' : ''}`} onClick={() => setProfileFollowListMode('followers')} aria-pressed={profileFollowListMode === 'followers'}><span>フォロワー</span><strong>{profileFollowCounts?.followers ?? 0}</strong></button></div><div className="tabs profile-tabs"><button className={profileFollowListMode === 'posts' && profileTab === 'posts' ? 'active-tab' : ''} onClick={() => { setProfileFollowListMode('posts'); setProfileTab('posts') }}>投稿</button><button className={profileFollowListMode === 'posts' && profileTab === 'audio' ? 'active-tab' : ''} onClick={() => { setProfileFollowListMode('posts'); setProfileTab('audio') }}>ボイス</button><button className={profileFollowListMode === 'following' ? 'active-tab' : ''} onClick={() => setProfileFollowListMode('following')}>フォロー中</button><button className={profileFollowListMode === 'followers' ? 'active-tab' : ''} onClick={() => setProfileFollowListMode('followers')}>フォロワー</button></div>{profileFollowListError && <p className="status-message status-error">{profileFollowListError}</p>}{profileFollowListLoading && profileFollowListMode !== 'posts' && <p className="status-message">読み込み中...</p>}{profileFollowListMode === 'posts' && <div className="timeline-list">{profilePostsToRender.map((post) => renderTimelinePost(post, { compact: true, showFollowButton: false }))}</div>}{profileFollowListMode === 'following' && !profileFollowListLoading && <div className="discover-list">{(profileFollowingUsers ?? []).length === 0 ? <p className="status-message">まだフォローしている人はいません</p> : (profileFollowingUsers ?? []).map((user) => { const name = user.display_name ?? user.username ?? 'friendcast user'; const isSelf = user.id === session?.user?.id; const canFollow = !!user.id && !isSelf; const isMutualFollow = !!user.id && !isSelf && followingIds.has(user.id) && myFollowerIds.has(user.id); return <article className="discover-user-item" key={`profile_following_${user.id}`}><button type="button" className="discover-user-main" onClick={() => { if (!user.id) return; goToProfile(user.id) }}><span className="discover-avatar" style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>@{user.username ?? 'user'}</small>{isMutualFollow && <span className="mutual-follow-badge">相互フォロー</span>}</span></button>{canFollow && <button className={`follow-btn ${isFollowing(user.id) ? 'is-following' : ''} profile-follow-list-btn`} type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (!user.id) return; void toggleFollow(user.id) }} disabled={isFollowPending(user.id)}>{isFollowPending(user.id) ? '処理中...' : (isFollowing(user.id) ? 'フォロー中' : 'フォロー')}</button>}</article> })}</div>}{profileFollowListMode === 'followers' && !profileFollowListLoading && <div className="discover-list">{(profileFollowerUsers ?? []).length === 0 ? <p className="status-message">まだフォロワーはいません</p> : (profileFollowerUsers ?? []).map((user) => { const name = user.display_name ?? user.username ?? 'friendcast user'; const isSelf = user.id === session?.user?.id; const canFollow = !!user.id && !isSelf; const isMutualFollow = !!user.id && !isSelf && followingIds.has(user.id) && myFollowerIds.has(user.id); return <article className="discover-user-item" key={`profile_follower_${user.id}`}><button type="button" className="discover-user-main" onClick={() => { if (!user.id) return; goToProfile(user.id) }}><span className="discover-avatar" style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>@{user.username ?? 'user'}</small>{isMutualFollow && <span className="mutual-follow-badge">相互フォロー</span>}</span></button>{canFollow && <button className={`follow-btn ${isFollowing(user.id) ? 'is-following' : ''} profile-follow-list-btn`} type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (!user.id) return; void toggleFollow(user.id) }} disabled={isFollowPending(user.id)}>{isFollowPending(user.id) ? '処理中...' : (isFollowing(user.id) ? 'フォロー中' : 'フォロー')}</button>}</article> })}</div>}</section>}{screen === 'search' && <section className="search-screen"><article className="search-panel"><h2>検索</h2><h3>ユーザーを見つける</h3><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="表示名・@usernameで検索" aria-label="ユーザー検索" />{discoverError && <p className="status-message status-error search-status">{discoverError}</p>}{followActionError && <p className="status-message status-error search-status">{followActionError}</p>}{!isSearchingUsers && <section className="friend-suggestions"><h3>友達かも？</h3><p className="status-message">まだフォローしていない人を見つけてみましょう。</p>{friendSuggestionsStatus === 'loading' && <p className="status-message search-status">候補を読み込み中です...</p>}{friendSuggestionsStatus === 'error' && <p className="status-message status-error search-status">{friendSuggestionsError}</p>}{friendSuggestionsStatus === 'loaded' && visibleFriendSuggestions.length === 0 && <p className="status-message">おすすめできるユーザーはまだいません</p>}<div className="discover-list">{visibleFriendSuggestions.map((user) => { const name = user.display_name ?? user.username ?? 'friendcast user'; const bioPreview = (user.bio ?? '').trim().slice(0, 48); return <article className="discover-user-item" key={`suggestion_${user.id}`}><button type="button" className="discover-user-main" onClick={() => { if (!user.id) return; goToProfile(user.id) }}><span className="discover-avatar" style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>@{user.username ?? 'user'}</small>{bioPreview && <small>{bioPreview}{(user.bio ?? '').trim().length > 48 ? '…' : ''}</small>}</span></button><button className={`follow-btn ${isFollowing(user.id) ? 'is-following' : ''}`} type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (!user.id) return; void toggleFollow(user.id) }} disabled={isFollowPending(user.id)}>{isFollowPending(user.id) ? '処理中...' : (isFollowing(user.id) ? 'フォロー中' : 'フォロー')}</button></article> })}</div></section>}{isSearchingUsers && discoverStatus === 'loading' && <p className="status-message search-status">ユーザーを読み込み中です...</p>}{isSearchingUsers && discoverStatus === 'loaded' && filteredDiscoverUsers.length === 0 && <article className="empty-state-card"><strong>該当するユーザーが見つかりません</strong><p>友達がまだfriendcastにいない場合は、招待コードを送ってみましょう。</p><div className="empty-state-actions"><button type="button" className="soft-action-button" onClick={() => goToScreen('settings')}>友達を招待する</button></div></article>}{isSearchingUsers && <div className="discover-list">{filteredDiscoverUsers.map((user) => { const name = user.display_name ?? user.username; return <article className="discover-user-item" key={user.id}><button type="button" className="discover-user-main" onClick={() => goToProfile(user.id)}><span className="discover-avatar" style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>@{user.username}</small></span></button><button className={`follow-btn ${isFollowing(user.id) ? 'is-following' : ''}`} type="button" onClick={() => void toggleFollow(user.id)} disabled={isFollowPending(user.id)}>{isFollowPending(user.id) ? '処理中...' : (isFollowing(user.id) ? 'フォロー中' : 'フォロー')}</button></article> })}</div>}</article></section>}{screen === 'settings' && <section className="search-screen"><article className="search-panel"><h2>設定</h2><h3>テーマ</h3><div className="tabs"><button className={theme === 'light' ? 'active-tab' : ''} onClick={() => setTheme('light')}>ライト</button><button className={theme === 'dark' ? 'active-tab' : ''} onClick={() => setTheme('dark')}>ダーク</button></div><section className="settings-card"><h3>公開範囲の初期設定</h3><div className="visibility-grid">{(['followers','close_friends','specific','private'] as Visibility[]).map((v) => <button key={v} className={`visibility-item ${defaultVisibility === v ? 'selected' : ''}`} onClick={() => setDefaultVisibility(v)}>{visibilityComposeLabel[v]}</button>)}</div><p className="status-message">{visibilityDefaultDescription[defaultVisibility] ?? '公開範囲を選ぶと説明が表示されます。'}</p></section><section className="settings-card"><h3>アクティビティ</h3><p className="status-message">あなたの投稿への反応や新しいフォローを確認できます。</p><button type="button" className="follow-btn settings-toggle-btn" onClick={() => { setIsActivityOpen((prev) => { const next = !prev; if (next) void loadActivities(); return next }) }}>{isActivityOpen ? '閉じる' : '見る'}</button>{isActivityOpen && <div className="discover-list">{activityLoading && <p className="status-message">アクティビティを読み込み中...</p>}{activityError && <p className="status-message status-error">{activityError}</p>}{!activityLoading && !activityError && activityItems.length === 0 && <p className="status-message">まだアクティビティはありません。</p>}{(Array.isArray(activityItems) ? activityItems : []).map((item) => { const name = item.actor?.display_name ?? item.actor?.username ?? 'ユーザー'; const handle = item.actor?.username ? `@${item.actor.username}` : '@user'; const createdAtLabel = item.createdAt ? formatDate(item.createdAt) : ''; return <article key={item.id} className="discover-user-item"><button type="button" className="discover-user-main" onClick={() => item.actor?.id && goToProfile(item.actor.id)}><span className="discover-avatar" style={item.actor?.avatar_url ? { backgroundImage: `url(${item.actor.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>{handle}{createdAtLabel ? ` ・ ${createdAtLabel}` : ''}</small><span>{activityMessage(item)}</span>{item.postPreview && <small>対象投稿: {item.postPreview || '投稿'}</small>}{item.postId && <button type="button" className="soft-action-button" onClick={(event) => { event.stopPropagation(); goToScreen('home') }}>投稿を見る</button>}{item.code && <small>コード: {item.code}</small>}</span></button></article> })}</div>}</section><section className="invite-settings settings-card"><h3>友達を招待</h3><p className="status-message">招待コードを送って、friendcastに友達を招待できます。招待コードを使うと招待してくれた人を自動でフォローし、必要なら親しい友達にも追加できます。</p><div className="invite-row"><button type="button" className="follow-btn" onClick={() => void createInviteCode()} disabled={isInviteCreating}>{isInviteCreating ? '作成中...' : '招待コードを作成'}</button></div>{pendingInviteCode && <p className="status-message">招待コード {pendingInviteCode} が見つかりました。下で利用できます。</p>}<div className="invite-use-row"><input value={inviteCodeInput} onChange={(event) => setInviteCodeInput(normalizeInviteCode(event.target.value))} placeholder="招待コードを入力 (例: FC-8K3P2X)" /><button type="button" className="follow-btn" onClick={() => void useInviteCode()} disabled={isInviteUsing}>{isInviteUsing ? '処理中...' : '使う'}</button></div>{inviteActionError && <p className="status-message status-error">{inviteActionError}</p>}{inviteActionMessage && <p className="status-message">{inviteActionMessage}</p>}<button type="button" className="follow-btn settings-toggle-btn" onClick={() => setIsInvitesOpen((prev) => !prev)}>{isInvitesOpen ? '招待コード一覧を閉じる' : '招待コード一覧を見る'}</button>{isInvitesOpen && <div className="invite-list">{visibleInvites.length === 0 && <p className="status-message">まだ有効な招待コードはありません。</p>}{visibleInvites.map((invite) => { const statusLabel = invite.status === 'used' ? '使用済み' : invite.status === 'expired' ? '期限切れ' : 'active'; const isActiveInvite = invite.status === 'active'; const isRevoking = !!inviteRevokingMap[invite.id]; return <article className="discover-user-item" key={invite.id}><span className="discover-user-main"><span className="discover-user-meta"><strong>{invite.code}</strong><small>{statusLabel}</small></span></span><span className="invite-actions"><button type="button" className="follow-btn" onClick={() => void copyText(invite.code, 'コードをコピーしました。')}>コードをコピー</button><button type="button" className="follow-btn" onClick={() => void copyText(getInviteShareText(invite.code), '共有文をコピーしました。')}>共有文をコピー</button>{isActiveInvite && <button type="button" className="follow-btn invite-revoke-btn" onClick={() => void revokeInviteCode(invite)} disabled={isRevoking}>{isRevoking ? '処理中...' : '取り消し'}</button>}</span></article> })}
</div>}</section><section className="friends-settings settings-card"><h3>親しい友達</h3><p className="status-message">親しい友達に追加した人だけに届く投稿で使います。</p><button type="button" className="follow-btn settings-toggle-btn" onClick={() => setIsCloseFriendsOpen((prev) => !prev)}>{isCloseFriendsOpen ? '閉じる' : '管理する'}</button>{isCloseFriendsOpen && <>{closeFriendsError && <p className="status-message status-error">{closeFriendsError}</p>}{discoverStatus === 'loaded' && discoverUsers.filter((user) => followingIds.has(user.id) && user.id !== session.user.id).length === 0 && <p className="status-message">フォロー中のユーザーがまだいません。検索から友達をフォローしてみましょう。</p>}<div className="discover-list">{discoverUsers.filter((user) => followingIds.has(user.id) && user.id !== session.user.id).map((user) => { const name = user.display_name ?? user.username; const added = closeFriendIds.has(user.id); const pending = isCloseFriendPending(user.id); return <article className="discover-user-item" key={user.id}><button type="button" className="discover-user-main" onClick={() => goToProfile(user.id)}><span className="discover-avatar" style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>@{user.username}</small></span></button><button className={`follow-btn ${added ? 'is-following' : ''}`} type="button" onClick={() => void toggleCloseFriend(user.id)} disabled={pending}>{pending ? '処理中...' : (added ? '追加済み' : '追加')}</button></article> })}</div></>}</section><section className="settings-card"><p className="status-message">自分のテスト投稿は、ホーム/プロフィールの各投稿から削除できます。</p></section><section className="settings-card"><button className="logout-btn" onClick={() => sb?.auth.signOut()}>ログアウト</button></section></article></section>}{screen === 'compose' && <section className="compose-screen"><div className="compose-topbar compose-topbar-compact"><button className="compose-close-button" aria-label="ホームに戻る" onClick={() => goToScreen('home')} type="button">×</button></div><textarea ref={composeTextareaRef} rows={2} maxLength={MAX_COMPOSE_LENGTH} value={composeText} onChange={handleComposeTextChange} onInput={adjustComposeTextareaHeight} placeholder="いまどうしてる？" className="compose-textarea" /><p className={`compose-counter ${composeText.length >= MAX_COMPOSE_LENGTH ? 'is-limit' : composeText.length >= 120 ? 'is-near-limit' : ''}`}>{composeText.length} / {MAX_COMPOSE_LENGTH}</p><article className="record-card"><div className={`record-waveform ${isRecording ? 'live' : ''}`}>{Array.from({ length: 12 }).map((_, i) => <span key={i} className="record-bar" style={{ animationDelay: `${i * 0.06}s` }} />)}</div><button className={`record-fab ${isRecording ? 'recording' : ''}`} onClick={toggleRecording} type="button">🎙</button><p>{isRecording ? '録音中... タップして停止' : 'タップして録音を開始'}</p><p>{isRecording ? `${formatDuration(recordingSeconds * 1000)} / ${formatDuration(MAX_RECORDING_MS)}` : (recordedBlob ? formatDuration(recordedDurationMs) : '')}</p>{recordedBlob && <div className="audio-preview"><button type="button" className="voice-play-button" onClick={() => { if (!previewAudioRef.current && recordedUrl) previewAudioRef.current = new Audio(recordedUrl); void previewAudioRef.current?.play() }}><span className="play-icon">▷</span><span>再生確認</span></button><button type="button" onClick={handleClearRecordedAudio}>削除</button></div>}{recordingNotice && <p className="compose-status-message">{recordingNotice}</p>}{recordingError && <p className="compose-error-message">{recordingError}</p>}{!isRecordSupported && <p className="compose-error-message">このブラウザでは録音に対応していません</p>}</article><div className="compose-sticky-action"><button className="compose-post-btn" disabled={(!composeText.trim() && !recordedBlob) || isPosting} onClick={handleCreatePost}>{isPosting ? '投稿中...' : '投稿する'}</button>{postingStatusMessage && <p className="compose-status-message">{postingStatusMessage}</p>}{errorMessage && <p className="compose-error-message">{errorMessage}</p>}</div><p className="compose-current-visibility">公開範囲：{visibilityComposeLabel[composeVisibility]}</p><div className="compose-visibility-area"><p className="compose-visibility-label">公開範囲</p><div className="visibility-chip-group">{(['followers','close_friends','specific','private'] as Visibility[]).map((v) => { const active = composeVisibility === v; return <button key={v} className={`visibility-chip ${active ? 'active' : ''}`} onClick={() => { setComposeVisibility(v); setCustomRecipientError(''); setErrorMessage('') }} type="button" aria-pressed={active}>{active ? `✓ ${visibilityComposeLabel[v]}` : visibilityComposeLabel[v]}</button> })}</div>{composeVisibility === 'close_friends' && closeFriendIds.size === 0 && <p className="custom-audience-inline-note">親しい友達がまだ設定されていません。</p>}{composeVisibility === 'specific' && <div className="custom-recipient-panel"><p className={`custom-selection-count ${selectedCustomRecipientIds.size === 0 ? 'is-empty' : 'is-selected'}`}>選択中：{selectedCustomRecipientIds.size}人</p>{selectedCustomRecipientIds.size === 0 ? <p className="custom-audience-inline-note custom-selection-help">このままだと誰にも届かない可能性があります。届ける相手を選んでください。</p> : <p className="custom-audience-inline-note custom-selection-help">選択中：{selectedCustomRecipientIds.size}人</p>}{followingProfiles.length === 0 ? <p className="custom-audience-inline-note">フォロー中のユーザーがいません。検索からユーザーをフォローしてください</p> : <div className="discover-list">{followingProfiles.map((user) => { const selected = selectedCustomRecipientIds.has(user.id); const name = user.display_name ?? user.username; return <button key={user.id} type="button" className={`discover-user-item custom-recipient-item ${selected ? 'is-selected' : ''}`} onClick={() => toggleCustomRecipient(user.id)}><span className="discover-user-main"><span className="discover-avatar" style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{getAvatarInitial(name)}</span><span className="discover-user-meta"><strong>{name}</strong><small>@{user.username}</small></span></span><span className={`follow-btn custom-recipient-toggle ${selected ? 'is-selected' : ''}`}>{selected ? '✓ 選択中' : '選択'}</span></button> })}</div>}{customRecipientError && <p className="compose-error-message">{customRecipientError}</p>}</div>}</div></section>}</main>{showBottomNav && <nav className="bottom-nav" aria-label="メインナビ"><button className={screen === 'home' ? 'nav-active' : ''} onClick={() => goToScreen('home')}><span>🏠</span><small>ホーム</small></button><button className={screen === 'search' ? 'nav-active' : ''} onClick={() => goToScreen('search')}><span>🔎</span><small>検索</small></button><button onClick={() => goToScreen('compose')}><span>➕</span><small>投稿</small></button><button className={screen === 'profile' ? 'nav-active' : ''} onClick={() => goToScreen('profile')}><span>👤</span><small>プロフ</small></button><button className={screen === 'settings' ? 'nav-active' : ''} onClick={() => goToScreen('settings')}><span>⚙️</span><small>設定</small></button></nav>}{showGlobalFab && <button className="fab global-fab" onClick={() => goToScreen('compose')}>🎙</button>}</div>
}
