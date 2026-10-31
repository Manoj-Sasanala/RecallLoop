import type { ReactNode } from "react";
import type { Session } from "../types";

const STEPS = ["Sources", "Diagnose", "Remediate", "Prove"];

export function Shell({
  activeStep,
  session,
  onPurge,
  onHome,
  children,
}: {
  activeStep: number;
  session: Session | null;
  onPurge?: () => void;
  onHome?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <aside className="rail">
        <div>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">RecallLoop</span>
          </div>
          <div className="brand-sub">Exam readiness, measured</div>
          {onHome && (
            <button className="btn ghost small" style={{ marginTop: 8, paddingLeft: 0 }} onClick={onHome}>
              ← All sessions
            </button>
          )}
        </div>

        <ol className="steps" aria-label="Progress">
          {STEPS.map((label, index) => (
            <li key={label} data-active={index === activeStep}>
              <span className="num">{String(index + 1).padStart(2, "0")}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>

        <div className="rail-foot">
          {session ? (
            <>
              <span className="src">{session.title}</span>
              <span>{session.demo_bundle_id ? "Seeded demo bundle" : "Uploaded material"}</span>
              {onPurge && (
                <button
                  className="btn ghost small"
                  style={{ justifySelf: "start", paddingLeft: 0 }}
                  onClick={() => {
                    if (window.confirm("Delete this session and all its data?")) onPurge();
                  }}
                >
                  Purge session data
                </button>
              )}
            </>
          ) : (
            <span>Source-grounded, deterministic scoring.</span>
          )}
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
