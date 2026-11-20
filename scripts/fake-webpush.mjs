// Stands in for the web-push package in scripts/push-flow-test.ts: records what would be sent.
export const sent = []
export default {
  setVapidDetails() {},
  async sendNotification(sub, payload) {
    if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
  },
}
