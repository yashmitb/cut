// A template re-mounts on every navigation, so this entrance animation plays
// on each route change for a smooth page-to-page transition.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
