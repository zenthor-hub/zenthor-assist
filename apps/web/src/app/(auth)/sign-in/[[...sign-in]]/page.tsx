import { SignIn } from "@clerk/nextjs";

import { ZenthorLogo } from "@/components/zenthor-logo";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <ZenthorLogo className="h-10" />
      <SignIn
        redirectUrl="/home"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-xl",
          },
        }}
      />
    </div>
  );
}
