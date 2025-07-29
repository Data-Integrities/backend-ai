"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageType = void 0;
var MessageType;
(function (MessageType) {
    // Hub to Agent
    MessageType["COMMAND_REQUEST"] = "command_request";
    MessageType["AGENT_DISCOVERY"] = "agent_discovery";
    MessageType["HEALTH_CHECK"] = "health_check";
    MessageType["CONFIG_UPDATE"] = "config_update";
    // Agent to Hub
    MessageType["COMMAND_RESULT"] = "command_result";
    MessageType["AGENT_REGISTER"] = "agent_register";
    MessageType["AGENT_HEARTBEAT"] = "agent_heartbeat";
    MessageType["EVENT_NOTIFICATION"] = "event_notification";
    // Bidirectional
    MessageType["AUTH_REQUEST"] = "auth_request";
    MessageType["AUTH_RESPONSE"] = "auth_response";
    MessageType["ERROR"] = "error";
    // AI/Knowledge Management
    MessageType["GET_README"] = "get_readme";
    MessageType["README_RESPONSE"] = "readme_response";
    MessageType["UPDATE_KNOWLEDGE"] = "update_knowledge";
    MessageType["KNOWLEDGE_UPDATED"] = "knowledge_updated";
})(MessageType || (exports.MessageType = MessageType = {}));
//# sourceMappingURL=Communication.js.map