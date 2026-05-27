export const FriendcastLogo = () => (
  <svg
    className="home-brand-logo"
    viewBox="0 0 1200 260"
    role="img"
    aria-label="friendcast"
  >
    <defs>
      <linearGradient id="friendcastWordFill" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#6c43b7" />
        <stop offset="100%" stopColor="#7f56c7" />
      </linearGradient>
      <linearGradient id="friendcastPlaneFill" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ceb9ef" />
        <stop offset="100%" stopColor="#9f82dc" />
      </linearGradient>
    </defs>

    <g className="friendcast-logo-decor" aria-hidden="true">
      <path className="friendcast-flight-path" d="M272 64 C 362 124, 500 20, 666 50 C 776 70, 838 150, 966 120 C 1048 102, 1120 132, 1170 206" />
      <path className="friendcast-flight-loop" d="M954 122 C 934 132, 930 164, 956 176 C 984 190, 1010 164, 996 138 C 989 124, 970 116, 954 122Z" />

      <g className="friendcast-plane" transform="translate(146 16)">
        <path d="M0 36 L142 0 L102 56 L141 114 L76 90 L42 136 L28 83 L0 36Z" />
        <path className="friendcast-plane-fold" d="M42 36 L142 0 L74 50 Z" />
        <path className="friendcast-plane-fold" d="M42 36 L102 56 L74 50 Z" />
      </g>

      <path className="friendcast-star" d="M334 62l10 20 22 3-16 15 4 22-20-11-20 11 4-22-16-15 22-3Z" />
      <path className="friendcast-heart" d="M500 126c0-7 6-12 13-12 5 0 9 2 11 7 2-5 7-7 12-7 7 0 13 5 13 12 0 11-10 17-25 29-15-12-24-18-24-29Z" />
      <path className="friendcast-heart" d="M740 66c0-5 4-9 9-9 3 0 6 2 8 5 2-3 5-5 8-5 5 0 9 4 9 9 0 8-8 13-17 20-9-7-17-12-17-20Z" />
      <path className="friendcast-heart" d="M846 156c0-6 5-10 10-10 4 0 7 1 9 5 3-4 6-5 10-5 5 0 10 4 10 10 0 8-9 14-19 22-10-8-20-14-20-22Z" />

      <g className="friendcast-flower" transform="translate(604 26)">
        <circle cx="10" cy="4" r="4" /><circle cx="4" cy="10" r="4" /><circle cx="16" cy="10" r="4" /><circle cx="10" cy="16" r="4" /><circle className="friendcast-flower-core" cx="10" cy="10" r="3" />
      </g>
      <g className="friendcast-flower" transform="translate(940 182)">
        <circle cx="10" cy="4" r="4" /><circle cx="4" cy="10" r="4" /><circle cx="16" cy="10" r="4" /><circle cx="10" cy="16" r="4" /><circle className="friendcast-flower-core" cx="10" cy="10" r="3" />
      </g>

      <path className="friendcast-note" d="M812 94v34c0 8-6 14-13 14-6 0-11-4-11-10 0-5 4-10 11-10 3 0 5 0 7 2V96l28-6v27c0 8-6 14-13 14-6 0-11-4-11-10 0-6 4-10 11-10 3 0 6 1 7 2V90Z" />
      <path className="friendcast-note" d="M1068 122v26c0 7-5 12-11 12-6 0-10-4-10-9 0-5 4-9 10-9 3 0 5 1 6 2v-21l22-5v21c0 7-5 12-11 12-5 0-10-4-10-9 0-5 4-9 10-9 2 0 4 0 4 1v-17Z" />

      <circle className="friendcast-dot" cx="385" cy="84" r="6" />
      <circle className="friendcast-dot" cx="540" cy="38" r="5" />
      <circle className="friendcast-dot" cx="696" cy="42" r="6" />
      <circle className="friendcast-dot" cx="920" cy="58" r="5" />
      <circle className="friendcast-dot" cx="1126" cy="190" r="6" />
    </g>

    <text x="278" y="182" className="friendcast-logo-text" fill="url(#friendcastWordFill)">friendcast</text>
  </svg>
)

export default FriendcastLogo
