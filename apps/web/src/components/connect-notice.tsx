import { Alert } from "@lemonsqueezy/wedges";

// Says what a deployment has not connected yet and how to connect it: store
// the named Orun secrets and redeploy (the deploy pushes them to the Worker).
export function ConnectNotice({
  title,
  missing,
  children,
}: {
  title: string;
  missing: string[];
  children?: React.ReactNode;
}) {
  return (
    <Alert className="not-prose my-4" title={title} color="warning">
      <p>
        Store{" "}
        {missing.map((key, i) => (
          <span key={key}>
            {i > 0 ? (i === missing.length - 1 ? " and " : ", ") : null}
            <code>{key}</code>
          </span>
        ))}{" "}
        as Orun secrets for this environment and redeploy.
      </p>
      {children}
    </Alert>
  );
}
