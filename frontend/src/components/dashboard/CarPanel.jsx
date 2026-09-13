import CarVisualization from "./CarVisualization";
import VehicleGauges from "./VehicleGauges";

export default function CarPanel() {
  return (
    <div className="car-panel">
      <div className="car-panel-viz">
        <CarVisualization />
      </div>
      <div className="car-panel-gauges">
        <VehicleGauges />
      </div>
    </div>
  );
}
