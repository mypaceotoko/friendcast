import { useMemo, useState } from 'react'
import { audienceLabel, mockPosts, mockReplies, mockSearchAudioLogs, mockUsers, visibilityDescriptions, visibilityOptions, type Visibility } from './mockData'

type Screen = 'home' | 'compose' | 'detail' | 'profile' | 'search' | 'settings'
type Theme = 'dark' | 'light' | 'system'
type ProfileTab = 'posts' | 'audio' | 'replies' | 'likes'

const visibilityIcons: Record<Visibility, string> = {
  followers: '◉',
  close_friends: '◍',
  specific: '✦',
  private: '◐',
}

const visibilityComposeLabel: Record<Visibility, string> = {
  followers: 'フォロワー',
  close_friends: '親しい友達',
  specific: 'カスタム',
  private: '自分のみ',
}

const visibilityBadgeIcon: Record<Visibility, string> = {
  followers: '◉',
  close_friends: '◎',
  specific: '✦',
  private: '◐',
}


const ShareIcon = () => (
  <svg className="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="18" cy="5" r="2" />
    <circle cx="6" cy="12" r="2" />
    <circle cx="18" cy="19" r="2" />
    <path d="M8 11l8-5" />
    <path d="M8 13l8 5" />
  </svg>
)

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
        <div className="tweet-header-row">
          <div className="tweet-header">
            <strong>{post.displayName}</strong>
            <span>{post.userId}</span>
            <span>·</span>
            <time>{post.createdAt}</time>
          </div>
          <div className="visibility-badge">
            <span>{visibilityBadgeIcon[post.visibility]}</span>
            <span>{visibilityComposeLabel[post.visibility]}</span>
          </div>
        </div>
        <p className="tweet-text">{post.text}</p>
        {post.audio && (
          <button className={`audio-card ${activeAudioId === post.id ? 'audio-active' : ''}`} onClick={() => setActiveAudioId(activeAudioId === post.id ? null : post.id)}>
            <span className="audio-play">{activeAudioId === post.id ? '❚❚' : '▷'}</span>
            <span className="audio-wave" aria-hidden>
              {Array.from({ length: 12 }).map((_, i) => <i key={i} style={{ height: `${18 + (i % 6) * 4}px` }} />)}
            </span>
            <span className="audio-duration">{post.audio.duration}</span>
          </button>
        )}
        {!compact && (
          <div className="delivery-inline">
            <small>{audienceLabel[post.visibility]}に届きます</small>
          </div>
        )}
        <div className="action-row">
          <button className="icon-btn" onClick={() => { setSelectedPostId(post.id); setScreen('detail') }}>💬 <span>3</span></button>
          <button className="icon-btn">🔁 <span>1</span></button>
          <button className={`icon-btn ${likedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setLikedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}>♡ <span>{likedPostIds.includes(post.id) ? 46 : 45}</span></button>
          <button className={`icon-btn ${savedPostIds.includes(post.id) ? 'active-icon' : ''}`} onClick={() => setSavedPostIds((prev) => prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id])}><ShareIcon /></button>
        </div>
      </div>
    </article>
  )

  return (
    <div className={`app-shell theme-${resolvedTheme}`}>
      {screen === 'home' && (
        <header className="home-mobile-header">
          <button className="mini-avatar" onClick={() => setScreen('profile')}>い</button>
          <h1>friendcast</h1>
          <span className="header-spacer" aria-hidden="true" />
        </header>
      )}

      <main className={`screen ${screen === 'home' ? 'screen-home' : 'glass'}`}>
        {screen === 'home' && (
          <section>
            <div className="home-context-copy">
              <p>フォローしている人と、あなたに届いた声</p>
            </div>
            <div className="timeline-list">{mockPosts.map((post) => renderTimelinePost(post))}</div>
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

        {screen !== 'home' && screen !== 'compose' && (
          <section>
            {screen === 'detail' && <><h2>投稿詳細</h2><div className="timeline-list">{renderTimelinePost(selectedPost, true)}</div>{mockReplies[selectedPost.id]?.map((reply) => <article key={reply.id} className="reply-card"><div className='row between'><strong>{reply.user}</strong><small>{reply.createdAt}</small></div><p>{reply.text}</p>{reply.audio && <span className="pill">音声返信</span>}</article>)}</>}
            {screen === 'profile' && (
              <section className="profile-screen">
                <header className="profile-mobile-header">
                  <div className="profile-header-left">
                    <button className="profile-icon-btn" onClick={() => setScreen('home')} aria-label="戻る">←</button>
                    <div>
                      <h2>佐々木 結衣</h2>
                      <p>1,204 件の投稿</p>
                    </div>
                  </div>
                  <button className="profile-close-btn" onClick={() => setScreen('settings')} aria-label="設定">×</button>
                </header>

                <div className="profile-cover" />
                <article className="profile-block">
                  <div className="profile-top-row">
                    <div className="profile-photo" />
                    <button className="profile-edit-btn">プロフィールを編集</button>
                  </div>
                  <h3 className="profile-name">佐々木 結衣</h3>
                  <p className="profile-id">@yui_sasaki</p>
                  <p className="profile-bio">日常の小さな音を集めるのが好きです。🎧 週末はカフェ巡り。声で繋がる優しい世界を探しています。</p>
                  <div className="profile-meta">
                    <span>⌂ 10月12日</span>
                    <span>▦ 2023年4月から利用</span>
                  </div>
                <div className="profile-follow-row">
                  <span><strong>342</strong> フォロー中</span>
                  <span><strong>1,024</strong> フォロワー</span>
                </div>
                </article>

                <div className="tabs profile-tabs">
                  <button className={profileTab === 'posts' ? 'active-tab' : ''} onClick={() => setProfileTab('posts')}>投稿</button>
                  <button className={profileTab === 'audio' ? 'active-tab' : ''} onClick={() => setProfileTab('audio')}>ボイス</button>
                  <button className={profileTab === 'replies' ? 'active-tab' : ''} onClick={() => setProfileTab('replies')}>返信</button>
                  <button className={profileTab === 'likes' ? 'active-tab' : ''} onClick={() => setProfileTab('likes')}>いいね</button>
                </div>

                <article className="profile-pinned">
                  <div className="profile-pin-label">📌 固定されたボイス</div>
                  <div className="profile-pinned-body">
                    <div className="tweet-avatar profile-pinned-avatar">結</div>
                    <div className="profile-pinned-main">
                      <div className="tweet-header"><strong>佐々木 結衣</strong><span>@yui_sasaki</span><span>·</span><time>2026年5月23日 08:45</time><span>•••</span></div>
                      <p className="tweet-text">初めまして！自己紹介ボイスを録ってみました。<br />よろしくお願いします✨</p>
                      <div className="audio-card profile-voice-card">
                        <span className="audio-play">▷</span>
                        <span className="audio-wave" aria-hidden>{Array.from({ length: 10 }).map((_, i) => <i key={i} style={{ height: `${14 + (i % 5) * 6}px` }} />)}</span>
                        <span className="audio-duration">0:45</span>
                      </div>
                      <div className="action-row profile-action-row">
                        <button className="icon-btn">💬 <span>12</span></button>
                        <button className="icon-btn">🔁 <span>4</span></button>
                        <button className="icon-btn active-icon">♡ <span>86</span></button>
                        <button className="icon-btn"><ShareIcon /></button>
                      </div>
                    </div>
                  </div>
                </article>
              </section>
            )}
            {screen === 'search' && (
              <section className="search-screen">
                <article className="search-panel">
                  <h2>友人検索 / 招待</h2>
                  <input placeholder="名前・IDで検索" />
                  {mockUsers.map((user) => (
                    <article key={user.id} className="row between user-row">
                      <span>{user.name} {user.id}</span>
                      <button>フォロー</button>
                    </article>
                  ))}
                </article>
                <article className="search-panel search-logs">
                  <h3>友達の最近の声</h3>
                  {mockSearchAudioLogs.map((log) => (
                    <div key={log.id} className="search-log-item">
                      <button className="search-log-play" aria-label={`${log.name}の音声を再生`}>▷</button>
                      <div className="search-log-main">
                        <div className="search-log-head">
                          <strong>{log.name}</strong>
                          <time>{log.createdAt}</time>
                        </div>
                        <div className="search-log-meta">
                          <span>{log.duration}</span>
                          <span className="search-log-visibility">{visibilityComposeLabel[log.visibility]}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </article>
              </section>
            )}
            {screen === 'settings' && <><h2>設定</h2><label>テーマ設定</label><select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}><option value="dark">ダーク</option><option value="light">ライト</option><option value="system">システム設定に合わせる</option></select><label>公開範囲の初期設定</label><select defaultValue="followers">{Object.entries(visibilityOptions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></>}
          </section>
        )}
      </main>


      {screen !== 'compose' && (
        <button className="fab global-fab" onClick={() => setScreen('compose')} aria-label="投稿作成">🎙</button>
      )}

      {screen !== 'compose' && (
        <nav className="bottom-nav glass">
          <button className={screen === 'home' ? 'nav-active' : ''} onClick={() => setScreen('home')}><span>⌂</span><small>ホーム</small></button>
          <button className={screen === 'search' ? 'nav-active' : ''} onClick={() => setScreen('search')}><span>⌕</span><small>検索</small></button>
          <button onClick={() => setScreen('compose')}><span>◉</span><small>投稿</small></button>
          <button className={screen === 'profile' ? 'nav-active' : ''} onClick={() => setScreen('profile')}><span>◡</span><small>プロフ</small></button>
          <button className={screen === 'settings' ? 'nav-active' : ''} onClick={() => setScreen('settings')}><span>⚙</span><small>設定</small></button>
        </nav>
      )}
    </div>
  )
}
