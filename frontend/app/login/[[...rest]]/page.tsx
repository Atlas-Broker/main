import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#22c55e",
    colorBackground: "#0f0f0f",
    fontFamily: "Nunito Sans, sans-serif",
  },
};

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#07080B" }}
    >
      <SignIn appearance={clerkAppearance} />
    </div>
  );
}
