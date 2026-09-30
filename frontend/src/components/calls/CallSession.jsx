import { useAppStore } from "../../store";
import { useCallSession } from "../../hooks/useCallSession";
import IncomingCallModal from "./IncomingCallModal";

export default function CallSession() {
  const { call, loading, respond, end } = useCallSession();
  const backendUser = useAppStore((state) => state.backendUser);
  const isIncoming = Boolean(call && backendUser && call.callee_id === backendUser.id);

  return (
    <div className="call-session">
      {/* Starting a call lives in the top bar's Call panel (CallPanel); this
          only carries the dialog for a call in progress, which has to show
          whatever else is open. */}
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
