import { useMemo, useState } from 'react'
import { mockPosts, mockReplies, mockUsers, visibilityOptions, type Visibility } from './mockData'

type Screen = 'home' | 'compose' | 'detail' | 'profile' | 'search' | 'settings'

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedPostId, setSelectedPostId] = useState(mockPosts[0].id)
  const [composeText, setComposeText] = useState('')
  const [composeVisibility, setComposeVisibility] = useState<Visibility>('close_friends')
  const [isRecording, setIsRecording] = useState(false)
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null)

  const selectedPost = useMemo(() => mockPosts.find((post) => post.id === selectedPostId) ?? mockPosts[0], [selectedPostId])

  const header = (
    <header className="app-header glass">
      <h1>friendcast</h1>
      <p>バズらない。だから、本音で話せる。</p>
    </header>
  )

  return (
    <div className="app-shell">
      {header}
      <main className="screen glass">
        {screen === 'home' && (
          <section>
            <h2>ホーム</h2>
            {mockPosts.map((post) => (
              <article key={post.id} className="post-card glass-soft">
                <div className="row between"><strong>{post.displayName}</strong><span>{post.userId} · {post.time}</span></div>
                <p>{post.text}</p>
                {post.audio && (
                  <button className="audio-card" onClick={() => setActiveAudioId(activeAudioId === post.id ? null : post.id)}>
                    <span>{activeAudioId === post.id ? '⏸ 再生中' : '▶ 再生'}</span>
                    <span className="wave" />
                    <span>{post.audio.duration}</span>
                  </button>
                )}
                <div className="row between"><span className="pill">{visibilityOptions[post.visibility]}</span><button onClick={() => {setSelectedPostId(post.id); setScreen('detail')}}>返信</button></div>
              </article>
            ))}
            <button className="fab" onClick={() => setScreen('compose')}>＋</button>
          </section>
        )}

        {screen === 'compose' && (
          <section>
            <h2>投稿作成</h2>
            <textarea maxLength={140} value={composeText} onChange={(e) => setComposeText(e.target.value)} placeholder="今の気持ちを140文字以内で" />
            <div className="row between"><small>{composeText.length}/140</small><small>誰に届くかが毎回わかる安心設計</small></div>
            <button className={`record-btn ${isRecording ? 'recording' : ''}`} onClick={() => setIsRecording(!isRecording)}>{isRecording ? '録音中...' : '録音を開始'}</button>
            <div className="audio-preview glass-soft"><span>録音プレビュー</span><span className="wave" /></div>
            <label>公開範囲</label>
            <select value={composeVisibility} onChange={(e) => setComposeVisibility(e.target.value as Visibility)}>
              {Object.entries(visibilityOptions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="post-btn">投稿する</button>
          </section>
        )}

        {screen === 'detail' && (
          <section>
            <h2>投稿詳細</h2>
            <article className="post-card glass-soft"><strong>{selectedPost.displayName}</strong><p>{selectedPost.text}</p></article>
            {mockReplies[selectedPost.id]?.map((reply) => <article key={reply.id} className="reply-card"><strong>{reply.user}</strong><p>{reply.text}</p>{reply.audio && <span className="pill">音声返信</span>}</article>)}
            <textarea placeholder="返信を入力" />
            <button>🎙 音声返信</button>
          </section>
        )}

        {screen === 'profile' && (
          <section>
            <h2>プロフィール</h2>
            <article className="profile-card glass-soft">
              <div className="avatar" />
              <strong>{mockUsers[0].name}</strong><p>{mockUsers[0].id}</p><p>{mockUsers[0].bio}</p>
              <p>{mockUsers[0].follows} フォロー · {mockUsers[0].followers} フォロワー</p>
              <div className="audio-preview"><span>固定自己紹介音声</span><span className="wave" /></div>
            </article>
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
