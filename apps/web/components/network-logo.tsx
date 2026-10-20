export function NetworkLogo({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/network-tower.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={'network-logo ' + className}
      data-brand="network-tower"
    />
  );
}
