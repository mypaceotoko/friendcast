import { useMemo, useState } from 'react'
import { audienceLabel, mockPosts, mockReplies, mockUsers, visibilityDescriptions, visibilityOptions, type Visibility } from './mockData'

type Screen = 'home' | 'compose' | 'detail' | 'profile' | 'search' | 'settings'
type Theme = 'dark' | 'light' | 'system'
type ProfileTab = 'posts' | 'replies' | 'audio' | 'saved'

const visibilityIcons: Record<Visibility, string> = {
  followers: '👥',
  close_friends: '🤝',
  specific: '⚙️',
  private: '🔒',
}

const visibilityComposeLabel: Record<Visibility, string> = {
  followers: 'フォロワー',
  close_friends: '親しい友達',
  specific: 'カスタム',
  private: '自分のみ',
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedPostId, setSelectedPostId] = useState(mockPosts[0].id)
  const [composeText, setComposeText] = useState('')
  const [composeVisibility, setComposeVisibility] = useState<Visibility>('close_friends')
  const [isRecording, setIsRecording] = useState(false)
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null)
  const [savedPostIds, setSavedPostIds] = useState<string[]>([])
  const [likedPostIds, setLikedPostIds] = useState<string[]>([])
  const [theme, setTheme] = useState<Theme>('light')
  const [profileTab, setProfileTab] = useState<ProfileTab>('posts')

  const selectedPost = useMemo(() => mockPosts.find((post) => post.id === selectedPostId) ?? mockPosts[0], [selectedPostId])

  const resolvedTheme = theme === 'system'
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme

  const renderTimelinePost = (post: (typeof mockPosts)[number], compact = false) => (
    <article key={post.id} className="tweet-item" role="button">
      <div className="tweet-avatar">{post.displayName.slice(0, 1)}</div>
      <div className="tweet-content">
        <div className="tweet-header">
          <strong>{post.displayName}</strong>
          <span>{post.userId}</span>
          <span>·</span>
          <time>{post.createdAt}</time>
        </div>
        <p className="tweet-text">{post.text}</p>
        {post.audio && (
          <button className={`audio-card ${activeAudioId === post.id ? 'audio-active' : ''}`} onClick={() => setActiveAudioId(activeAudioId === post.id ? null : post.id)}>
            <span>{activeAudioId === post.id ? '⏸ 再生中' : '▶ 再生する'}</span>
            <span className="wave" />
            <span>{post.audio.duration}</span>
          </button>
        )}
        {!compact && (
          <div className="delivery-inline">
            <span className="pill safe">{visibilityOptions[post.visibility]}</span>
            <small>この声は「{audienceLabel[post.visibility]}」に届きます</small>
          </div>
        )}
        <div className="action-row">
          <button className="icon-btn" onClick={() => { setSelectedPostId(post.id); setScreen('detail') }}>💬</button>
          <button className="icon-btn">🔁</button>
          <button className={`icon-btn ${likedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setLikedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}>♡</button>
          <button className={`icon-btn ${savedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setSavedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}>🔖</button>
          <button className="icon-btn">↗</button>
        </div>
      </div>
    </article>
  )

  return (
    <div className={`app-shell theme-${resolvedTheme}`}>
      <header className="app-header glass">
        <h1>friendcast</h1>
        <p>親しい人にだけ届ける、声のタイムライン</p>
      </header>
      <main className="screen glass">
        {screen === 'home' && (
          <section>
            <h2>ホーム</h2>
            <p className="intro-copy">バズらない。だから、本音で話せる。</p>
            <div className="timeline-list">{mockPosts.map((post) => renderTimelinePost(post))}</div>
            <button className="fab" onClick={() => setScreen('compose')}>＋</button>
          </section>
        )}

        {screen === 'compose' && (
          <section className="compose-screen">
            <header className="compose-topbar">
              <button className="compose-cancel" onClick={() => setScreen('home')}>キャンセル</button>
              <button className="compose-close" aria-label="閉じる" onClick={() => setScreen('home')}>×</button>
            </header>

            <div className="compose-input-row">
              <div className="compose-avatar">い</div>
              <div className="compose-input-wrap">
                <textarea
                  maxLength={140}
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                  placeholder="いまどうしてる？"
                  className="compose-textarea"
                />
              </div>
            </div>

            <div className="compose-counter">{composeText.length} / 140</div>

            <article className="record-card">
              <div className={`record-waveform ${isRecording ? 'live' : ''}`}>
                {Array.from({ length: 12 }).map((_, i) => <span key={i} className="record-bar" />)}
              </div>
              <button className={`record-fab ${isRecording ? 'recording' : ''}`} onClick={() => setIsRecording(!isRecording)}>
                🎙
              </button>
              <p>{isRecording ? '録音中... タップして停止' : 'タップして録音を開始'}</p>
            </article>

            <button className="post-btn compose-post-btn">投稿する</button>

            <div className="compose-visibility-area">
              <p className="compose-visibility-label">公開範囲</p>
              <div className="visibility-grid compose-visibility-grid">
                {(Object.keys(visibilityOptions) as Visibility[]).map((key) => (
                  <button key={key} className={`visibility-item compose-visibility-item ${composeVisibility === key ? 'selected' : ''}`} onClick={() => setComposeVisibility(key)}>
                    <span className="visibility-left"><span className="visibility-icon">{visibilityIcons[key]}</span><span><strong>{visibilityComposeLabel[key]}</strong><small>{visibilityDescriptions[key]}</small></span></span>
                    <span className="visibility-mark">{composeVisibility === key ? '✓' : '○'}</span>
                  </button>
                ))}
              </div>
            </div>

            <p className="confirm-line">この投稿は「{audienceLabel[composeVisibility]}」に届きます。</p>
          </section>
        )}

        {screen === 'detail' && (
          <section>
            <h2>投稿詳細</h2>
            <div className="timeline-list">{renderTimelinePost(selectedPost, true)}</div>
            {mockReplies[selectedPost.id]?.map((reply) => <article key={reply.id} className="reply-card"><div className='row between'><strong>{reply.user}</strong><small>{reply.createdAt}</small></div><p>{reply.text}</p>{reply.audio && <span className="pill">音声返信</span>}</article>)}
            <textarea placeholder="返信を入力" />
            <button>🎙 音声返信</button>
          </section>
        )}

        {screen === 'profile' && (
          <section>
            <div className="profile-header-area" />
            <article className="profile-block">
              <div className="avatar">い</div>
              <button className="profile-action" onClick={() => setScreen('compose')}>声で投稿</button>
              <strong>{mockUsers[0].name}</strong><p>{mockUsers[0].id}</p><p>{mockUsers[0].bio}</p>
              <p>{mockUsers[0].follows} フォロー · {mockUsers[0].followers} フォロワー</p>
              <p className="intro-copy">声のプロフィール: はじめましてを、声で伝える。</p>
              <div className="audio-preview pinned"><span>固定自己紹介音声</span><span className="wave" /></div>
              <button onClick={() => setScreen('compose')}>自己紹介を録る</button>
            </article>
            <div className="tabs">
              <button className={profileTab === 'posts' ? 'active-tab' : ''} onClick={() => setProfileTab('posts')}>投稿</button>
              <button className={profileTab === 'replies' ? 'active-tab' : ''} onClick={() => setProfileTab('replies')}>返信</button>
              <button className={profileTab === 'audio' ? 'active-tab' : ''} onClick={() => setProfileTab('audio')}>音声</button>
              <button className={profileTab === 'saved' ? 'active-tab' : ''} onClick={() => setProfileTab('saved')}>保存</button>
            </div>
            <div className="timeline-list">{mockPosts.filter((post) => profileTab !== 'saved' || savedPostIds.includes(post.id)).map((post) => renderTimelinePost(post))}</div>
          </section>
        )}

        {screen === 'search' && (
          <section>
            <h2>友人検索 / 招待</h2>
            <input placeholder="名前・IDで検索" />
            {mockUsers.map((user) => <article key={user.id} className="row between user-row"><span>{user.name} {user.id}</span><button>フォロー</button></article>)}
            <div className="invite">招待リンク: https://friendcast.app/invite/friends</div>
          </section>
        )}

        {screen === 'settings' && (
          <section>
            <h2>設定</h2>
            <label>テーマ設定</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}><option value="dark">ダーク</option><option value="light">ライト</option><option value="system">システム設定に合わせる</option></select>
            <label>公開範囲の初期設定</label>
            <select defaultValue="followers">{Object.entries(visibilityOptions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <label className="row between"><span>通知を受け取る</span><input type="checkbox" defaultChecked /></label>
            <button className="logout">ログアウト</button>
          </section>
        )}
      </main>

      <nav className="bottom-nav glass">
        <button onClick={() => setScreen('home')}>ホーム</button>
        <button onClick={() => setScreen('search')}>検索</button>
        <button onClick={() => setScreen('compose')}>投稿</button>
        <button onClick={() => setScreen('profile')}>プロフィール</button>
        <button onClick={() => setScreen('settings')}>設定</button>
      </nav>
    </div>
  )
}
