import { Link } from "react-router";
import type { Route } from "./+types/$";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Oops, this page could not be found." },
    {
      name: "description",
      content: "The page you are looking for does not exist. It may have been renamed or deleted.",
    },
  ];
}

export default function CatchAll() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-center p-4">
      <h1 className="text-9xl font-extrabold text-gray-800 tracking-wider">
        404
      </h1>
      <p className="text-2xl md:text-3xl font-semibold text-gray-600 mt-2">
        Oops, this page could not be found.
      </p>
      <p className="text-gray-500 mt-4 max-w-sm">
        The page you are looking for does not exist. It may have been renamed or deleted.
      </p>
      <Link
        to="/"
        className="mt-8 px-6 py-3 text-white bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
      >
        Back to Home
      </Link>
    </div>
  );
}
