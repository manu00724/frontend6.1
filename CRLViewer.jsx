import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

export default function CRLImageViewer({ base64Image }) {
  if (!base64Image) return null;

  return (
    <div className="h-full w-full overflow-auto bg-slate-100">
      <TransformWrapper
        minScale={0.5}
        maxScale={5}
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent>
          <img
            src={`data:image/png;base64,${base64Image}`}
            alt="CRL Document"
            className="select-none"
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
