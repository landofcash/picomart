import {Card, CardContent} from "@/components/ui/card";

export default function FinalPage() {
  return (
    <Card
      className="h-full flex items-center justify-center bg-gradient-to-tl from-neutral-100 to-white text-neutral-900 shadow-inner border border-neutral-100">
      <CardContent className="flex flex-col items-center justify-center text-center px-4 sm:px-12 space-y-4 sm:space-y-6">
        <h2 className="text-4xl font-semibold tracking-tight text-slate-900">
          Thank You for Trying Picomart!
        </h2>
        <div className="text-base text-slate-700 max-w-md leading-relaxed space-y-4">
          <p>
            We hope you enjoyed using the Picomart app and experienced just how easy and fast shopping can be.
          </p>
          <p className="pt-4 text-center font-medium text-slate-800">
            <span className="text-fuchsia-700">Scan it. Shop it. Pay in a flash.</span>
            <br/>
            <span className="text-slate-900 text-lg font-semibold">Picomart.</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
