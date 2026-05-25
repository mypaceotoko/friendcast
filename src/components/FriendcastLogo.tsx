export const FriendcastLogo = () => (
  <svg
    className="home-brand-logo"
    viewBox="0 0 720 160"
    role="img"
    aria-label="friendcast"
  >
    <defs>
      <linearGradient id="friendcastLogoFill" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#5f3ea8" />
        <stop offset="100%" stopColor="#7558c2" />
      </linearGradient>
    </defs>
    <text
      x="16"
      y="118"
      className="friendcast-logo-text"
      fill="url(#friendcastLogoFill)"
    >
      friendcast
    </text>
  </svg>
)

export default FriendcastLogo
