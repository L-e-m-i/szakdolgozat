import { Link } from "react-router";


export default function CatchAll() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-center p-4">
      <h1 className="text-9xl font-extrabold text-gray-800 tracking-wider">
        404
      </h1>
      <p className="text-2xl md:text-3xl font-semibold text-gray-600 mt-2">
        Hoppá, ez a lap nem található.
      </p>
      <p className="text-gray-500 mt-4 max-w-sm">
        A keresett oldal nem található. Lehet, hogy átnevezték vagy törölték.
      </p>
      <Link
        to="/"
        className="mt-8 px-6 py-3 text-white bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
      >
        Vissza a kezdőlapra
      </Link>
    </div>
  );
}
