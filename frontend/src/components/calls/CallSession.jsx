import { useAppStore } from "../../store";
import { useCallSession } from "../../hooks/useCallSession";
import CallLauncher from "./CallLauncher";
import IncomingCallModal from "./IncomingCallModal";

export default function CallSession() {
  const { call, loading, respond, end } = useCallSession();
  const backendUser = useAppStore((state) => state.backendUser);
  const isIncoming = Boolean(call && backendUser && call.callee_id === backendUser.id);

  return (
    <>
      <CallLauncher />
      <IncomingCallModal
        call={call}
        isIncoming={isIncoming}
        loading={loading}
        onRespond={respond}
        onEnd={end}
      />
    </>
  );
}
