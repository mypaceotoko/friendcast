export const FriendcastLogo = () => (
  <svg
    className="home-brand-logo"
    viewBox="0 0 720 220"
    role="img"
    aria-label="friendcast"
  >
    <defs>
      <linearGradient id="friendcastLogoFill" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#5f3ea8" />
        <stop offset="100%" stopColor="#7558c2" />
      </linearGradient>
    </defs>

    <g className="friendcast-logo-decor" aria-hidden="true">
      <path
        className="friendcast-flight-path"
        d="M192 58 C 255 16, 386 10, 510 36 C 568 50, 626 78, 662 106"
      />
      <g className="friendcast-plane" transform="translate(156 40)">
        <path d="M0 9 24 0 13 11 24 22Z" />
      </g>
      <g className="friendcast-spark" transform="translate(255 24)">
        <path d="M0 5h10M5 0v10" />
      </g>
      <g className="friendcast-spark" transform="translate(358 22)">
        <path d="M0 4h8M4 0v8" />
      </g>
      <g className="friendcast-flower" transform="translate(295 76)">
        <circle cx="7" cy="3.5" r="3" />
        <circle cx="3.5" cy="7" r="3" />
        <circle cx="10.5" cy="7" r="3" />
        <circle cx="7" cy="10.5" r="3" />
        <circle className="friendcast-flower-core" cx="7" cy="7" r="2" />
      </g>
      <path className="friendcast-heart" d="M440 72c0-5 4-9 9-9 3 0 5 1 7 4 2-3 5-4 8-4 5 0 9 4 9 9 0 8-8 12-17 19-9-7-16-11-16-19Z" />
      <g className="friendcast-spark" transform="translate(550 88)">
        <path d="M0 4h8M4 0v8" />
      </g>
    </g>

    <text
      x="126"
      y="155"
      className="friendcast-logo-text"
      fill="url(#friendcastLogoFill)"
    >
      friendcast
    </text>
  </svg>
)

export default FriendcastLogo
