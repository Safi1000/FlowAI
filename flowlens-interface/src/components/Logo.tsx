import { Workflow } from "lucide-react";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className = "", showText = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-brand opacity-20 blur-xl rounded-full" />
        <div className="relative bg-gradient-brand p-2 rounded-lg">
          <Workflow className="h-6 w-6 text-white" />
        </div>
      </div>
      {showText && (
        <span className="text-xl font-bold bg-gradient-brand bg-clip-text text-transparent">
          FlowAI
        </span>
      )}
    </div>
  );
}
