import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white">
        <EmptyState
          icon={<Compass size={22} />}
          title="Page not found"
          description="The page you requested is not part of this workspace."
        />
        <div className="pb-8 text-center">
          <Link to="/" className="text-xs font-semibold text-accent-600 hover:text-accent-700">
            Return to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
