import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

/* The icon iOS puts on the iPad's home screen when he taps "Add to Home
 * Screen" at the measuring table. Without one, iOS saves a blurred
 * screenshot of whatever page was open, which looks like nothing at all.
 *
 * 180x180 is what an iPad asks for. The monogram is drawn at its own
 * 135x160 and centred on the app's ink, so it is never scaled up - an
 * upscaled logo is the quickest way to make a thing look cheap, and this
 * one sits on his home screen next to WhatsApp.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const logo = fs.readFileSync(
    path.join(process.cwd(), "public", "logo.png"),
  );
  const src = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1714",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={135} height={160} alt="" />
      </div>
    ),
    size,
  );
}
