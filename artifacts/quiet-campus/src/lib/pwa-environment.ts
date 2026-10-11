export function installationEnvironment(input: {
  userAgent: string; platform: string; maxTouchPoints: number;
  displayStandalone: boolean; appleStandalone?: boolean; embedded: boolean;
}) {
  const ios = /iPad|iPhone|iPod/i.test(input.userAgent) ||
    (input.platform === 'MacIntel' && input.maxTouchPoints > 1);
  return {
    ios,
    android: /Android/i.test(input.userAgent) && !ios,
    installed: input.displayStandalone || input.appleStandalone === true,
    embedded: input.embedded,
  };
}

export function canOfferInstallation(input: { installed: boolean; embedded: boolean }, hasPrompt: boolean) {
  return hasPrompt && !input.installed && !input.embedded;
}
