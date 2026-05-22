export type Visibility = 'followers' | 'close_friends' | 'specific' | 'private'

export const visibilityOptions: Record<Visibility, string> = {
  followers: 'フォロワー',
  close_friends: '親しい友達',
  specific: '特定の人だけ',
  private: '自分のみ',
}

export const mockUsers = [
  { name: 'いっぺい', id: '@ippei', bio: '声で日記を残すのが好き。', follows: 48, followers: 42 },
  { name: 'ゆうや', id: '@yuya_dev', bio: '夜に雑談キャスト更新中', follows: 75, followers: 61 },
]

export const mockPosts = [
  { id: 'p1', displayName: 'いっぺい', userId: '@ippei', time: '5分', text: '今日の散歩中、急に良いアイデアが浮かんだ。', visibility: 'close_friends' as const },
  { id: 'p2', displayName: 'ゆうや', userId: '@yuya_dev', time: '18分', text: '公開SNSだと言いにくいけど、今日はちょっとしんどかった。', visibility: 'specific' as const, audio: { duration: '1:24' } },
  { id: 'p3', displayName: 'みさき', userId: '@misaki', time: '1時間', text: 'AI時代って効率化だけで終わっていいのかな？人間らしさを残す場が必要だと思う。', visibility: 'followers' as const, audio: { duration: '2:03' } },
  { id: 'p4', displayName: 'りく', userId: '@riku', time: '3時間', text: '明日は完全オフにする。ひとこと日記だけ残して寝る。', visibility: 'private' as const },
]

export const mockReplies: Record<string, { id: string; user: string; text: string; audio?: boolean }[]> = {
  p2: [
    { id: 'r1', user: 'いっぺい', text: 'それ分かる。無理せず行こう。' },
    { id: 'r2', user: 'みさき', text: '声で返したよ！', audio: true },
  ],
}
