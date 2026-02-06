export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-gray-500">
            Tokamak Agent Layer - ERC-8004 Compliant Agent Registry
          </p>
          <div className="flex gap-6">
            <a
              href="https://github.com/tokamak-network"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              GitHub
            </a>
            <a
              href="https://tokamak.network"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Tokamak Network
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
