import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { audienceLabel, mockReplies, mockSearchAudioLogs, mockUsers, visibilityOptions, type Visibility } from './mockData'
import { supabase } from './lib/supabase'

type Screen = 'home' | 'compose' | 'detail' | 'profile' | 'search' | 'settings'
type Theme = 'dark' | 'light' | 'system'
type ProfileTab = 'posts' | 'audio' | 'replies' | 'likes'

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null; bio: string }
type Post = { id: string; text: string; visibility: Visibility; created_at: string; user_id: string; profiles: { username: string; display_name: string | null; avatar_url: string | null }[] | null }

const visibilityComposeLabel: Record<Visibility, string> = { followers: 'フォロワー', close_friends: '親しい友達', specific: 'カスタム', private: '自分のみ' }
const visibilityBadgeIcon: Record<Visibility, string> = { followers: '◉', close_friends: '◎', specific: '✦', private: '◐' }
const ShareIcon = () => <svg className="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="M8 11l8-5" /><path d="M8 13l8 5" /></svg>

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [composeText, setComposeText] = useState('')
  const [composeVisibility, setComposeVisibility] = useState<Visibility>('close_friends')
  const [isRecording, setIsRecording] = useState(false)
  const [savedPostIds, setSavedPostIds] = useState<string[]>([])
  const [likedPostIds, setLikedPostIds] = useState<string[]>([])
  const [theme, setTheme] = useState<Theme>('light')
  const [profileTab, setProfileTab] = useState<ProfileTab>('posts')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)

  const resolvedTheme = theme === 'system' ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme

  const ensureProfile = async (activeSession: Session | null) => {
    if (!activeSession?.user) return setProfile(null)
    const id = activeSession.user.id
    const displayName = activeSession.user.user_metadata?.full_name ?? activeSession.user.user_metadata?.name ?? 'friendcast user'
    const avatar = activeSession.user.user_metadata?.avatar_url ?? null
    const username = `user_${id.replace(/-/g, '').slice(0, 8)}`
    await supabase.from('profiles').upsert({ id, username, display_name: displayName, avatar_url: avatar, bio: '' }, { onConflict: 'id' })
    const { data } = await supabase.from('profiles').select('id,username,display_name,avatar_url,bio').eq('id', id).single()
    if (data) setProfile(data)
  }

  const loadPosts = async () => {
    const { data } = await supabase.from('posts').select('id,text,visibility,created_at,user_id,profiles(username,display_name,avatar_url)').order('created_at', { ascending: false }).limit(100)
    if (data) setPosts(data as Post[])
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await ensureProfile(data.session)
      if (data.session) await loadPosts()
    })
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      await ensureProfile(newSession)
      if (newSession) await loadPosts()
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const selectedPost = useMemo(() => posts.find((post) => post.id === selectedPostId) ?? posts[0] ?? null, [posts, selectedPostId])
  const myPosts = useMemo(() => posts.filter((post) => post.user_id === session?.user.id), [posts, session?.user.id])

  const handleCreatePost = async () => {
    const text = composeText.trim()
    if (!text || !session?.user) return
    const { error } = await supabase.from('posts').insert({ user_id: session.user.id, text, visibility: composeVisibility })
    if (!error) {
      setComposeText('')
      setScreen('home')
      await loadPosts()
    }
  }

  const formatDate = (value: string) => new Date(value).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const profileName = profile?.display_name ?? 'friendcast user'
  const profileHandle = profile?.username ? `@${profile.username}` : '@user'
  const profileBio = profile?.bio || '自己紹介はまだありません。'

  if (!session) return <div className={`app-shell theme-${resolvedTheme}`}><main className="screen login-screen"><article className="login-card"><h1>friendcast</h1><p>親しい人にだけ届ける、声のタイムライン</p><button className="google-login-btn" onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}>Googleでログイン</button></article></main></div>

  const renderTimelinePost = (post: Post, compact = false) => {
    const postProfile = post.profiles?.[0]
    const displayName = postProfile?.display_name ?? postProfile?.username ?? 'friendcast user'
    const handle = postProfile?.username ? `@${postProfile.username}` : '@user'
    return <article key={post.id} className="tweet-item" role="button">
      <div className="tweet-avatar">{displayName.slice(0, 1)}</div><div className="tweet-content"><div className="tweet-header-row"><div className="tweet-header"><strong>{displayName}</strong><span>{handle}</span><span>·</span><time>{formatDate(post.created_at)}</time></div><div className="visibility-badge"><span>{visibilityBadgeIcon[post.visibility]}</span><span>{visibilityComposeLabel[post.visibility]}</span></div></div><p className="tweet-text">{post.text}</p>{!compact && <div className="delivery-inline"><small>{audienceLabel[post.visibility]}に届きます</small></div>}<div className="action-row"><button className="icon-btn" onClick={() => { setSelectedPostId(post.id); setScreen('detail') }}>💬 <span>0</span></button><button className="icon-btn">🔁 <span>0</span></button><button className={`icon-btn ${likedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setLikedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}>♡ <span>{likedPostIds.includes(post.id) ? 1 : 0}</span></button><button className={`icon-btn ${savedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setSavedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}><ShareIcon /></button></div></div>
    </article>
  }

  return <div className={`app-shell theme-${resolvedTheme}`}>
    {screen === 'home' && <header className="home-mobile-header"><button className="mini-avatar" onClick={() => setScreen('profile')}>{profileName.slice(0, 1)}</button><h1>friendcast</h1><span className="header-spacer" /></header>}
    <main className={`screen ${screen === 'home' ? 'screen-home' : 'glass'}`}>
      {screen === 'home' && <section><div className="home-context-copy"><p>フォローしている人と、あなたに届いた声</p></div><div className="timeline-list">{posts.map((post) => renderTimelinePost(post))}</div></section>}
      {screen === 'profile' && <section className="profile-screen"><header className="profile-mobile-header"><div className="profile-header-left"><button className="profile-icon-btn" onClick={() => setScreen('home')}>←</button><div><h2>{profileName}</h2><p>{myPosts.length} 件の投稿</p></div></div><button className="profile-close-btn" onClick={() => setScreen('settings')}>×</button></header><div className="profile-cover" /><article className="profile-block"><div className="profile-top-row"><div className="profile-photo" style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} /><button className="profile-edit-btn">プロフィールを編集</button></div><h3 className="profile-name">{profileName}</h3><p className="profile-id">{profileHandle}</p><p className="profile-bio">{profileBio}</p></article><div className="tabs profile-tabs"><button className={profileTab === 'posts' ? 'active-tab' : ''} onClick={() => setProfileTab('posts')}>投稿</button><button className={profileTab === 'audio' ? 'active-tab' : ''} onClick={() => setProfileTab('audio')}>ボイス</button><button className={profileTab === 'replies' ? 'active-tab' : ''} onClick={() => setProfileTab('replies')}>返信</button><button className={profileTab === 'likes' ? 'active-tab' : ''} onClick={() => setProfileTab('likes')}>いいね</button></div><div className="timeline-list">{myPosts.map((post) => renderTimelinePost(post, true))}</div></section>}
      {screen === 'compose' && <section className="compose-screen"><div className="compose-input-row"><div className="compose-avatar">{profileName.slice(0, 1)}</div><div className="compose-input-wrap"><textarea maxLength={140} value={composeText} onChange={(e)=>setComposeText(e.target.value)} placeholder="いまどうしてる？" className="compose-textarea" /></div></div><div className="compose-counter">{composeText.length} / 140</div><article className="record-card"><button className={`record-fab ${isRecording ? 'recording' : ''}`} onClick={() => setIsRecording(!isRecording)}>🎙</button><p>{isRecording ? '録音中... タップして停止' : 'タップして録音を開始'}</p></article><div className="compose-visibility-area"><p className="compose-visibility-label">公開範囲</p><div className="visibility-grid compose-visibility-grid">{(Object.keys(visibilityOptions) as Visibility[]).map((key)=><button key={key} className={`visibility-item compose-visibility-item ${composeVisibility === key ? 'selected' : ''}`} onClick={()=>setComposeVisibility(key)}>{visibilityComposeLabel[key]}</button>)}</div></div><p className="confirm-line">この投稿は「{audienceLabel[composeVisibility]}」に届きます。</p><button className="compose-post-btn" disabled={!composeText.trim()} onClick={handleCreatePost}>投稿する</button></section>}
      {screen === 'detail' && selectedPost && <section><h2>投稿詳細</h2><div className="timeline-list">{renderTimelinePost(selectedPost, true)}</div>{mockReplies[selectedPost.id]?.map((reply) => <article key={reply.id} className="reply-card"><div className='row between'><strong>{reply.user}</strong><small>{reply.createdAt}</small></div><p>{reply.text}</p>{reply.audio && <span className="pill">音声返信</span>}</article>)}</section>}
      {screen === 'search' && <section className="search-screen"><article className="search-panel"><h2>友人検索 / 招待</h2><input placeholder="名前・IDで検索" />{mockUsers.map((user) => <article key={user.id} className="row between user-row"><span>{user.name} {user.id}</span><button>フォロー</button></article>)}</article><article className="search-panel search-logs"><h3>友達の最近の声</h3>{mockSearchAudioLogs.map((log) => <div key={log.id} className="search-log-item"><button className="search-log-play">▷</button><div className="search-log-main"><div className="search-log-head"><strong>{log.name}</strong><time>{log.createdAt}</time></div><div className="search-log-meta"><span>{log.duration}</span><span className="search-log-visibility">{visibilityComposeLabel[log.visibility]}</span></div></div></div>)}</article></section>}
      {screen === 'settings' && <section><h2>設定</h2><label>テーマ設定</label><select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}><option value="dark">ダーク</option><option value="light">ライト</option><option value="system">システム設定に合わせる</option></select><label>公開範囲の初期設定</label><select defaultValue="followers">{Object.entries(visibilityOptions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="logout-btn" onClick={() => supabase.auth.signOut()}>ログアウト</button></section>}
    </main>
    {screen !== 'compose' && <button className="fab global-fab" onClick={() => setScreen('compose')}>🎙</button>}
    {screen !== 'compose' && <nav className="bottom-nav glass"><button className={screen === 'home' ? 'nav-active' : ''} onClick={() => setScreen('home')}><span>⌂</span><small>ホーム</small></button><button className={screen === 'search' ? 'nav-active' : ''} onClick={() => setScreen('search')}><span>⌕</span><small>検索</small></button><button onClick={() => setScreen('compose')}><span>◉</span><small>投稿</small></button><button className={screen === 'profile' ? 'nav-active' : ''} onClick={() => setScreen('profile')}><span>◡</span><small>プロフ</small></button><button className={screen === 'settings' ? 'nav-active' : ''} onClick={() => setScreen('settings')}><span>⚙</span><small>設定</small></button></nav>}
  </div>
}
