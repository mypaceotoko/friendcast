export type Visibility = 'followers' | 'close_friends' | 'specific' | 'private'

export const visibilityOptions: Record<Visibility, string> = {
  followers: 'フォロワー',
  close_friends: '親しい友達',
  specific: '特定の人だけ',
  private: '自分のみ',
}

export const visibilityDescriptions: Record<Visibility, string> = {
  followers: 'あなたをフォローしている人に届きます。',
  close_friends: '選んだ親しい友達だけに届きます。',
  specific: '指定した相手だけがこの声を聴けます。',
  private: '自分だけの声メモとして残せます。',
}

export const audienceLabel: Record<Visibility, string> = {
  followers: 'フォロワー',
  close_friends: '親しい友達',
  specific: '選んだ相手',
  private: '自分のみ',
}

export const mockUsers = [
  { name: 'いっぺい', id: '@ippei', bio: '関西在住。音声配信とゆるい雑談が好きです。', follows: 48, followers: 42 },
  { name: 'ゆうや', id: '@yuya_dev', bio: '夜に雑談キャスト更新中。週末は長めの開発ふりかえりを録っています。音声SNSの使い心地を試すのが好きです。', follows: 75, followers: 61 },
  { name: 'みさき', id: '@misaki', bio: '', follows: 32, followers: 58 },
]

export const mockSearchAudioLogs = [
  { id: 's1', name: 'いっぺい', createdAt: '2026年5月23日 01:28', duration: '0:45', visibility: 'close_friends' as const },
  { id: 's2', name: 'ゆうや', createdAt: '2026年5月23日 01:15', duration: '1:24', visibility: 'specific' as const },
  { id: 's3', name: 'みさき', createdAt: '2026年5月23日 00:32', duration: '0:58', visibility: 'followers' as const },
]

export const mockPosts = [
  { id: 'p1', displayName: 'いっぺい', userId: '@ippei', time: '5分前', createdAt: '2026年5月23日 01:28', text: '今日の散歩中、急に良いアイデアが浮かんだ。', visibility: 'close_friends' as const },
  { id: 'p2', displayName: 'ゆうや', userId: '@yuya_dev', time: '18分前', createdAt: '2026年5月23日 01:15', text: '公開SNSだと言いにくいけど、今日はちょっとしんどかった。', visibility: 'specific' as const, audio: { duration: '1:24' } },
  { id: 'p3', displayName: 'みさき', userId: '@misaki', time: '1時間前', createdAt: '2026年5月23日 00:32', text: 'AI時代って効率化だけで終わっていいのかな？人間らしさを残す場が必要だと思う。', visibility: 'followers' as const, audio: { duration: '2:03' } },
  { id: 'p4', displayName: 'りく', userId: '@riku', time: '3時間前', createdAt: '2026年5月22日 22:11', text: '明日は完全オフにする。ひとこと日記だけ残して寝る。', visibility: 'private' as const },
]

export const mockReplies: Record<string, { id: string; user: string; text: string; createdAt: string; audio?: boolean }[]> = {
  p2: [
    { id: 'r1', user: 'いっぺい', text: 'それ分かる。無理せず行こう。', createdAt: '2026年5月23日 01:26' },
    { id: 'r2', user: 'みさき', text: '声で返したよ！', createdAt: '2026年5月23日 01:27', audio: true },
  ],
}
