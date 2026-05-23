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
const formatDuration = (ms: number | null) => !ms ? '--:--' : `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

export function App() {
const [screen, setScreen] = useState<Screen>('home')
const [composeText, setComposeText] = useState('')
const [composeVisibility] = useState<Visibility>('followers')
const [savedPostIds, setSavedPostIds] = useState<string[]>([])
const [likedPostIds, setLikedPostIds] = useState<string[]>([])
const [theme] = useState<Theme>('light')
const [profileTab, setProfileTab] = useState<ProfileTab>('posts')
const [session, setSession] = useState<Session | null>(null)
const [profile, setProfile] = useState<Profile | null>(null)
const [posts, setPosts] = useState<Post[]>([])
const [profileMap, setProfileMap] = useState<ProfileMap>({})
const [_selectedPostId, setSelectedPostId] = useState<string | null>(null)
const [errorMessage, setErrorMessage] = useState('')
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
const [audioUrlMap, setAudioUrlMap] = useState<Record<string, string>>({})
const [audioLoadState, setAudioLoadState] = useState<Record<string, 'idle' | 'loading' | 'ready' | 'error'>>({})
const [audioLoadError, setAudioLoadError] = useState<Record<string, string>>({})
const isRestoringSessionRef = useRef(true)
const mediaRecorderRef = useRef<MediaRecorder | null>(null)
const mediaStreamRef = useRef<MediaStream | null>(null)
const chunksRef = useRef<BlobPart[]>([])
const recordingTimerRef = useRef<number | null>(null)
const previewAudioRef = useRef<HTMLAudioElement | null>(null)
const playAudioRef = useRef<HTMLAudioElement | null>(null)

const resolvedTheme = theme === 'system' ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
const isRecordSupported = typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia

const stopRecorder = () => {
  if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
  recordingTimerRef.current = null
  mediaRecorderRef.current?.stop()
  mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
  mediaStreamRef.current = null
  setIsRecording(false)
}

const startRecording = async () => {
  if (!isRecordSupported) return setRecordingError('このブラウザでは録音に対応していません。')
  try {
    setRecordingError('')
    setRecordedBlob(null)
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    setRecordedUrl('')
    setRecordedDurationMs(0)
    setRecordingSeconds(0)
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
      setRecordedDurationMs(recordingSeconds * 1000)
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
    console.error(error)
    setRecordingError('マイク許可エラー: ブラウザのマイク設定を確認してください。')
  }
}

const toggleRecording = async () => { if (isRecording) stopRecorder(); else await startRecording() }

const ensureSignedUrl = async (post: Post) => {
  if (!post.audioAsset || audioUrlMap[post.id]) return
  setAudioLoadState((p) => ({ ...p, [post.id]: 'loading' }))
  const { data, error } = await supabase.storage.from(post.audioAsset.storage_bucket).createSignedUrl(post.audioAsset.storage_path, 60 * 30)
  if (error || !data?.signedUrl) {
    setAudioLoadState((p) => ({ ...p, [post.id]: 'error' }))
    setAudioLoadError((p) => ({ ...p, [post.id]: error?.message || 'signed URL取得失敗' }))
    return
  }
  setAudioUrlMap((p) => ({ ...p, [post.id]: data.signedUrl }))
  setAudioLoadState((p) => ({ ...p, [post.id]: 'ready' }))
}

const loadPosts = async () => {
  setPostsStatus('loading'); setPostsError('')
  const { data: postsData, error: postsErrorValue } = await supabase.from('posts').select('id,text,visibility,created_at,user_id,kind,audio_assets(id,post_id,storage_bucket,storage_path,mime_type,duration_ms,size_bytes)').order('created_at', { ascending: false }).limit(100)
  if (postsErrorValue) {
    setPosts([])
    setProfileMap({})
    setPostsStatus('error')
    setPostsError(postsErrorValue.message || '投稿の取得に失敗しました。')
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
    setPostsError(`プロフィール取得失敗: ${profilesError.message}`)
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
useEffect(() => {
  let isMounted = true
  const bootstrap = async () => { const { data } = await supabase.auth.getSession(); if (!isMounted) return; if (!data.session) { setInitialAuthLoading(false); isRestoringSessionRef.current = false; return } setSession(data.session); await ensureProfile(data.session); await loadPosts(); setInitialAuthLoading(false); isRestoringSessionRef.current = false }
  void bootstrap()
  const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => { if (!isMounted || isRestoringSessionRef.current) return; setSession(newSession); if (newSession) { await ensureProfile(newSession); await loadPosts() } })
  return () => { isMounted = false; listener.subscription.unsubscribe() }
}, [])

const myPosts = useMemo(() => posts.filter((post) => post.user_id === session?.user.id), [posts, session?.user.id])
const profileName = profile?.display_name ?? 'friendcast user'
const profileHandle = profile?.username ? `@${profile.username}` : '@user'
const profileBio = profile?.bio || '自己紹介はまだありません。'
const formatDate = (value: string) => new Date(value).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
if (initialAuthLoading) return <div className={`app-shell theme-${resolvedTheme}`}>loading...</div>
if (!session) return <div className={`app-shell theme-${resolvedTheme}`}><main className="screen login-screen"><article className="login-card"><h1>friendcast</h1><p>親しい人にだけ届ける、声のタイムライン</p>{sessionRestoreError && <p className="status-message status-error">{sessionRestoreError}</p>}<button className="google-login-btn" onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}>Googleでログイン</button></article></main></div>

const handleCreatePost = async () => {
  const text = composeText.trim()
  if (!session?.user || (!text && !recordedBlob)) return
  setIsPosting(true); setErrorMessage('')
  let storagePath: string | null = null
  let postId: string | null = null
  if (recordedBlob) {
    storagePath = `${session.user.id}/${Date.now()}.${(recordedBlob.type.split('/')[1] || 'webm').replace('x-', '')}`
    const { error } = await supabase.storage.from('voice-posts').upload(storagePath, recordedBlob, { contentType: recordedBlob.type, upsert: false })
    if (error) { setErrorMessage(`Storage upload失敗: ${error.message}`); setIsPosting(false); return }
  }
  const kind: PostKind = recordedBlob ? (text ? 'text_audio' : 'audio') : 'text'
  const { data: postData, error: postError } = await supabase.from('posts').insert({ user_id: session.user.id, text, visibility: composeVisibility || 'followers', kind }).select('id').single()
  if (postError || !postData?.id) {
    if (storagePath) await supabase.storage.from('voice-posts').remove([storagePath])
    setErrorMessage(`posts insert失敗: ${postError?.message ?? 'unknown'}`)
    setIsPosting(false)
    return
  }
  postId = postData.id
  if (recordedBlob && storagePath) {
    const { error: audioError } = await supabase.from('audio_assets').insert({ owner_id: session.user.id, post_id: postData.id, storage_bucket: 'voice-posts', storage_path: storagePath, mime_type: recordedBlob.type, duration_ms: recordedDurationMs, size_bytes: recordedBlob.size })
    if (audioError) {
      await supabase.from('posts').delete().eq('id', postId)
      await supabase.storage.from('voice-posts').remove([storagePath])
      setErrorMessage(`audio_assets insert失敗: ${audioError.message}`)
      setIsPosting(false)
      return
    }
  }
  setComposeText(''); setRecordedBlob(null); setRecordedDurationMs(0); if (recordedUrl) URL.revokeObjectURL(recordedUrl); setRecordedUrl('')
  setScreen('home'); await loadPosts(); setIsPosting(false)
}

const renderAudioPlayer = (post: Post) => {
  if (!post.audioAsset) return null
  const state = audioLoadState[post.id] ?? 'idle'
  const play = async () => {
    await ensureSignedUrl(post)
    const url = audioUrlMap[post.id]
    if (!url) return
    if (activeAudioPostId === post.id) { playAudioRef.current?.pause(); setActiveAudioPostId(null); return }
    playAudioRef.current?.pause()
    playAudioRef.current = new Audio(url)
    playAudioRef.current.onended = () => setActiveAudioPostId(null)
    try { await playAudioRef.current.play(); setActiveAudioPostId(post.id) } catch { setAudioLoadError((p) => ({ ...p, [post.id]: '再生失敗' })) }
  }
  return <div className="audio-card"><button className="audio-play" onClick={play}>{activeAudioPostId === post.id ? '❚❚' : '▷'}</button><div className="audio-wave">{Array.from({ length: 18 }).map((_, i) => <i key={i} style={{ height: `${8 + ((i % 6) * 4)}px` }} />)}</div><span className="audio-duration">{formatDuration(post.audioAsset.duration_ms)}</span>{state === 'loading' && <small>読み込み中...</small>}{audioLoadError[post.id] && <small className="status-error">{audioLoadError[post.id]}</small>}</div>
}
const resolvePostAuthor = (post: Post): PostProfile | null => profileMap[post.user_id] ?? null
const renderTimelinePost = (post: Post, compact = false) => { const authorProfile = resolvePostAuthor(post); const displayName = authorProfile?.display_name ?? authorProfile?.username ?? 'friendcast user'; const handle = authorProfile?.username ? `@${authorProfile.username}` : '@user'; return <article key={post.id} className="tweet-item" role="button"><div className="tweet-avatar" style={authorProfile?.avatar_url ? { backgroundImage: `url(${authorProfile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}>{displayName.slice(0, 1)}</div><div className="tweet-content"><div className="tweet-header-row"><div className="tweet-header"><strong>{displayName}</strong><span>{handle}</span><span>·</span><time>{formatDate(post.created_at)}</time></div><div className="visibility-badge"><span>{visibilityBadgeIcon[post.visibility]}</span><span>{visibilityComposeLabel[post.visibility]}</span></div></div><p className="tweet-text">{post.text}</p>{renderAudioPlayer(post)}{!compact && <div className="delivery-inline"><small>{audienceLabel[post.visibility]}に届きます</small></div>}<div className="action-row"><button className="icon-btn" onClick={() => { setSelectedPostId(post.id); setScreen('detail') }}>💬 <span>0</span></button><button className="icon-btn">🔁 <span>0</span></button><button className={`icon-btn ${likedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setLikedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}>♡ <span>{likedPostIds.includes(post.id) ? 1 : 0}</span></button><button className={`icon-btn ${savedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setSavedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}><ShareIcon /></button></div></div></article> }

return <div className={`app-shell theme-${resolvedTheme}`}><main className="screen">{screen === 'home' && <section>{postsStatus === 'error' && <p className="status-message status-error">{postsError}</p>}{posts.length === 0 && postsStatus !== 'loading' && <p className="status-message">投稿はまだありません</p>}<div className="timeline-list">{posts.map((post) => renderTimelinePost(post))}</div></section>}{screen === 'profile' && <section className="profile-screen"><h3>{profileName}</h3><p>{profileHandle}</p><p>{profileBio}</p><div className="tabs profile-tabs"><button className={profileTab === 'posts' ? 'active-tab' : ''} onClick={() => setProfileTab('posts')}>投稿</button><button className={profileTab === 'audio' ? 'active-tab' : ''} onClick={() => setProfileTab('audio')}>ボイス</button></div><div className="timeline-list">{(profileTab === 'audio' ? myPosts.filter((p) => p.audioAsset) : myPosts).map((post) => renderTimelinePost(post, true))}</div></section>}{screen === 'compose' && <section className="compose-screen"><textarea maxLength={140} value={composeText} onChange={(e)=>setComposeText(e.target.value.slice(0, 140))} placeholder="いまどうしてる？" className="compose-textarea" /><article className="record-card"><div className={`record-waveform ${isRecording ? 'live' : ''}`}>{Array.from({ length: 12 }).map((_, i) => <span key={i} className="record-bar" style={{ animationDelay: `${i * 0.06}s` }} />)}</div><button className={`record-fab ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>🎙</button><p>{isRecording ? '録音中... タップして停止' : 'タップして録音を開始'}</p><p>{formatDuration(recordingSeconds * 1000)}</p>{recordedBlob && <div className="audio-preview"><button onClick={() => { if (!previewAudioRef.current && recordedUrl) previewAudioRef.current = new Audio(recordedUrl); void previewAudioRef.current?.play() }}>再生確認</button><button onClick={() => { setRecordedBlob(null); setRecordedDurationMs(0); if (recordedUrl) URL.revokeObjectURL(recordedUrl); setRecordedUrl('') }}>再録音</button><span>録音済み</span></div>}{recordingError && <p className="compose-error-message">{recordingError}</p>}{!isRecordSupported && <p className="compose-error-message">このブラウザでは録音に対応していません</p>}</article><div className="compose-sticky-action"><button className="compose-post-btn" disabled={(!composeText.trim() && !recordedBlob) || isPosting} onClick={handleCreatePost}>{isPosting ? '投稿中...' : '投稿する'}</button>{errorMessage && <p className="compose-error-message">{errorMessage}</p>}</div></section>}</main>{screen !== 'compose' && <button className="fab global-fab" onClick={() => setScreen('compose')}>🎙</button>}</div>
}
