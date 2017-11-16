
var JSON = require("fp-modules-for-nodejs/lib/json");
var UTIL = require("fp-modules-for-nodejs/lib/util");


var MessageStore = exports.MessageStore = function(messages)
{
	var self = this;

	self.messages = [];

	self.targets = {};
	for (var i=0,ic=messages.length ; i<ic ; i++ )
	{
        var message = {
	    	meta: ((typeof messages[i].meta === "object")?messages[i].meta:JSON.decode(messages[i].meta || "{}")),
	    	og: messages[i].data
	    };
	    message.originalMeta = UTIL.copy(message.meta);
	    self.messages.push(message);
		
		if(message.meta.target) {
	        self.targets[message.meta.target] = i;
	    }
	}
}

MessageStore.prototype.getTargets = function()
{
	return UTIL.keys(this.targets);
}

MessageStore.prototype.getMessages = function()
{
    return this.getMessagesForTarget();
}

MessageStore.prototype.getMessagesForTarget = function(targetId)
{
	var messages = this.messages;
    try {
        var found = [];
        var groups = {};
        var groupStack = {};
        for( var i = 0, s = messages.length ; i<s ; i++ ) {
        
            // NOTE: If the filter gets more fine-grain it needs to always include group context (open and close) messages during
            //       filtering to ensure the nesting stays correct.
        	var match = false;
        	if (!targetId || messages[i].originalMeta["target"] == targetId)
        		match = true;

            if(match) {

                delete messages[i].meta["group"];
                delete messages[i].meta["group.start"];
                delete messages[i].meta["group.end"];
                delete messages[i].meta["group.parent"];
                delete messages[i].meta["group.expand"];

                if(typeof groupStack[messages[i].originalMeta["group.parent"] || ""]=="undefined") {
                    groupStack[messages[i].originalMeta["group.parent"] || ""] = [];
                }

                // collect messages into groups where applicable
                if(typeof messages[i].originalMeta["group.start"] != "undefined") {
                    groupStack[messages[i].originalMeta["group.parent"] || ""].push(messages[i].originalMeta.group);
                }
                if(typeof messages[i].originalMeta.group != "undefined") {
                    if(!groups[messages[i].originalMeta.group]) {
                        groups[messages[i].originalMeta.group] = [];
                        // placeholder for group
                        var offset = 0;
                        if(typeof messages[i].originalMeta["group.start"] != "undefined") {
                            offset = 1;
                        }
                        var len = groupStack[messages[i].originalMeta["group.parent"] || ""].length;
                        if(len>offset) {
                            groups[groupStack[messages[i].originalMeta["group.parent"] || ""][len-(1+offset)]].push(messages[i].originalMeta.group);
                        } else {
                            if(typeof messages[i].originalMeta["group.parent"] != "undefined") {
                                groups[messages[i].originalMeta["group.parent"]].push(messages[i].originalMeta.group);
                            } else {
                                found.push(messages[i].originalMeta.group);
                            }
                        }
                    } else
                    if(typeof groupStack[messages[i].originalMeta.group] !="undefined" && groupStack[messages[i].originalMeta.group].length>0) {
                        messages[i].originalMeta.group = groupStack[messages[i].originalMeta.group][groupStack[messages[i].originalMeta.group].length-1];
                    }
                    groups[messages[i].originalMeta.group].push(messages[i]);
                } else
                if(groupStack[messages[i].originalMeta["group.parent"] || ""].length>0) {
                    messages[i].originalMeta.group = groupStack[messages[i].originalMeta["group.parent"] || ""][groupStack[messages[i].originalMeta["group.parent"] || ""].length-1];
                    groups[messages[i].originalMeta.group].push(messages[i]);
                } else {
                    found.push(messages[i]);
                }
                if(typeof messages[i].originalMeta["group.end"] != "undefined") {
                    var elem = groupStack[messages[i].originalMeta["group.parent"] || ""].pop();
                }
            }
        }
        UTIL.forEach(groupStack, function(item) {
            if(item[1].length>0) {
                // TODO: Display warning to user
                system.log.warn("Group nesting not correct: Not all opened groups were closed again! Parent group: " + item[0]);
            }
        });
        if(found.length==0) return false;

        // merge groups back in (replace placeholders)
        function resolveGroup(found) {
            for( var i = 0 ; i<found.length ; i++ ) {
                if(typeof found[i] == "string") {
                    if(!groups[found[i]]) {
                        throw new Error("Group not found: " + found[i]);
                    }
                    var groupMessages = resolveGroup(groups[found[i]]);
                    delete groups[found[i]];

                    if(groupMessages.length>0) {
                        var groupExpand = groupMessages[0].originalMeta["group.expand"];
                        // remove all group start and end messages for this group
                        for( var j=groupMessages.length-1 ; j>=0 ; j-- ) {
                            if(groupMessages[j].originalMeta["group"]==found[i]) {
                                if((typeof groupMessages[j].originalMeta["group.start"] != "undefined" && typeof groupMessages[j].originalMeta["group.title"] == "undefined") ||
                                   typeof groupMessages[j].originalMeta["group.end"] != "undefined") {

                                    if(typeof groupMessages[j].originalMeta["group.expand"] != "undefined") {
                                        groupExpand = groupMessages[j].originalMeta["group.expand"];
                                    }
                                    groupMessages.splice(j,1);
                                }
                            }
                        }
                        // set group.start in first message
                        groupMessages[0].meta["group.start"] = true;
                        groupMessages[0].meta["group"] = found[i];
                        groupMessages[0].meta["group.expand"] = groupExpand;
                        // set group.end in last message
                        if(typeof groupMessages[groupMessages.length-1].meta["group.end"] == "undefined") {
                            groupMessages[groupMessages.length-1].meta["group.end"] = 1;
                        } else {
                            groupMessages[groupMessages.length-1].meta["group.end"] += 1;
                        }
                    }
                    found.splice.apply(found, [i, 1].concat(groupMessages));
                }
            }
            return found;
        }
        found = resolveGroup(found);

/*
var summary = [];
for( var i = 0 ; i<found.length ; i++ ) {
    var item = "";
    if(found[i].meta["group.start"]==true) {
        item = "start";
    }
    if(typeof found[i].meta["group.end"]!="undefined") {
        item += "-end("+found[i].meta["group.end"]+")";
    }
    summary.push(item);
}
TRACING_CONSOLE.log(summary, "summary");
*/

        delete groups;
        return found;
    } catch(e) {
        console.error(e);
    }
    return false;
}