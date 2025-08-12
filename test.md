# Nginx Forwarders Test

## Version 1: Using Emoji (Current Implementation)

| siteName | domains | listens | forwardsTo | allow | prv | ena |
|---|---|---|---|---|---|---|
| dashboard-homepage | homepage.dataintegrities.com | 80, 443 | 192.168.1.90:3000 | 192.168.1.0/24 | ✅ | ✅ |
| di-app | app.dataintegrities.com | 80, 443 | 192.168.1.22:80 |  | ❌ | ✅ |
| di-claude-search | claude-search.dataintegrities.com | 80, 443 | 192.168.1.70:3101 | 192.168.1.0/24 | ✅ | ✅ |
| di-dotcom | dataintegrities.com | 80, 443 | 192.168.1.20:80 |  | ❌ | ✅ |

## Version 2: Using HTML with Inline Styles

| siteName | domains | listens | forwardsTo | allow | prv | ena |
|---|---|---|---|---|---|---|
| dashboard-homepage | homepage.dataintegrities.com | 80, 443 | 192.168.1.90:3000 | 192.168.1.0/24 | <span style="color: green">✓</span> | <span style="color: green">✓</span> |
| di-app | app.dataintegrities.com | 80, 443 | 192.168.1.22:80 |  | <span style="color: red">✗</span> | <span style="color: green">✓</span> |
| di-claude-search | claude-search.dataintegrities.com | 80, 443 | 192.168.1.70:3101 | 192.168.1.0/24 | <span style="color: green">✓</span> | <span style="color: green">✓</span> |
| di-dotcom | dataintegrities.com | 80, 443 | 192.168.1.20:80 |  | <span style="color: red">✗</span> | <span style="color: green">✓</span> |

## Version 3: Using Different Emoji

| siteName | domains | listens | forwardsTo | allow | prv | ena |
|---|---|---|---|---|---|---|
| dashboard-homepage | homepage.dataintegrities.com | 80, 443 | 192.168.1.90:3000 | 192.168.1.0/24 | 🟢 | 🟢 |
| di-app | app.dataintegrities.com | 80, 443 | 192.168.1.22:80 |  | 🔴 | 🟢 |
| di-claude-search | claude-search.dataintegrities.com | 80, 443 | 192.168.1.70:3101 | 192.168.1.0/24 | 🟢 | 🟢 |
| di-dotcom | dataintegrities.com | 80, 443 | 192.168.1.20:80 |  | 🔴 | 🟢 |

## Version 4: Using Unicode with Color Names

| siteName | domains | listens | forwardsTo | allow | prv | ena |
|---|---|---|---|---|---|---|
| dashboard-homepage | homepage.dataintegrities.com | 80, 443 | 192.168.1.90:3000 | 192.168.1.0/24 | ✓ (green) | ✓ (green) |
| di-app | app.dataintegrities.com | 80, 443 | 192.168.1.22:80 |  | ✗ (red) | ✓ (green) |
| di-claude-search | claude-search.dataintegrities.com | 80, 443 | 192.168.1.70:3101 | 192.168.1.0/24 | ✓ (green) | ✓ (green) |
| di-dotcom | dataintegrities.com | 80, 443 | 192.168.1.20:80 |  | ✗ (red) | ✓ (green) |

## Raw Emoji Test

- ✅ Green checkmark emoji
- ❌ Red X emoji  
- 🟢 Green circle
- 🔴 Red circle
- <span style="color: green">✓</span> HTML green checkmark
- <span style="color: red">✗</span> HTML red X