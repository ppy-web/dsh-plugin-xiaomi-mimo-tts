import { CORE_CLIENT_STYLES } from './core.js'
import { HISTORY_CLIENT_STYLES } from './history-styles.js'
import { QQBOT_CLIENT_STYLES } from './qqbot-styles.js'
import { WORKBENCH_CLIENT_STYLES } from './workbench.js'

export { CORE_CLIENT_STYLES, HISTORY_CLIENT_STYLES, QQBOT_CLIENT_STYLES, WORKBENCH_CLIENT_STYLES }

export const CLIENT_STYLES = [
  CORE_CLIENT_STYLES,
  WORKBENCH_CLIENT_STYLES,
  HISTORY_CLIENT_STYLES,
  QQBOT_CLIENT_STYLES,
].join('\n')
