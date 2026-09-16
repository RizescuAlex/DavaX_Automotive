import CarVisualization from "./CarVisualization";
import VehicleGauges from "./VehicleGauges";
import SpotifyControls from "./SpotifyControls";

export default function CarPanel() {
  return (
    <div className="car-panel">
      <SpotifyControls />
      <div className="car-panel-viz">
        <CarVisualization />
      </div>
      <div className="car-panel-gauges">
        <VehicleGauges />
      </div>
    </div>
  );
}
