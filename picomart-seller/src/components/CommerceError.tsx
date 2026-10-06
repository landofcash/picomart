export default function CommerceError({ error }: { error: string }) {
  if (!error) return null;
  const message = /Approval canceled/.test(error)
    ? error
    : /Insufficient PathUSD/.test(error)
      ? "Add PathUSD to cover this action and its transaction fee, then try again."
      : /uncertain|unresolved|outcome|RPC action failed/i.test(error)
        ? "We could not confirm the outcome. Check the saved operation before trying again."
        : /changed|differs|locked/i.test(error)
          ? "Your account or the details changed. Review this step again before continuing."
          : /revert|deadline|expired/i.test(error)
            ? "This action could not be completed. Refresh the current status before trying again."
            : /disabled|not configured|not enabled/i.test(error)
              ? "This service is unavailable. Please try again when it is ready."
              : "We could not complete this step. Check the details below before trying again.";
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm space-y-2"
    >
      <p>{message}</p>
      {message !== error && (
        <details className="text-xs text-muted-foreground break-words">
          <summary className="cursor-pointer">Technical details</summary>
          <p className="mt-2">{error}</p>
        </details>
      )}
    </div>
  );
}
