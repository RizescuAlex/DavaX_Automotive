import { useAppStore } from "../../store";
import { useCallSession } from "../../hooks/useCallSession";
import IncomingCallModal from "./IncomingCallModal";

export default function CallSession() {
  const { call, loading, respond, end } = useCallSession();
  const backendUser = useAppStore((state) => state.backendUser);
  const isIncoming = Boolean(call && backendUser && call.callee_id === backendUser.id);

  return (
    <div className="call-session">
      {/* Dialog for a call in progress; calls are started from CallPanel. */}
      <IncomingCallModal
        call={call}
        isIncoming={isIncoming}
        loading={loading}
        onRespond={respond}
        onEnd={end}
      />
    </div>
  );
}
