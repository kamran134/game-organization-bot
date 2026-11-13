/** Direct link that opens the Mini App with a start_param (works for users who never pressed /start). */
export function webAppLink(startParam: string): string {
  return `https://t.me/gameorganizationbot/webapp?startapp=${startParam}`;
}
