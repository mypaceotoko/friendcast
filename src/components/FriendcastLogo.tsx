type FriendcastLogoProps = {
  src?: string
}

export const FriendcastLogo = ({ src = '/IMG_7619.jpeg' }: FriendcastLogoProps) => (
  <img
    className="home-brand-logo home-logo-banner-image"
    src={src}
    alt="friendcast"
    loading="eager"
    decoding="async"
  />
)

export default FriendcastLogo
