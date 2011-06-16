
var ENCODER = require("insight/encoder/default"),
    JSON = require("modules/json");

exports.run = function()
{
    var encoder = ENCODER.Encoder();

    var subData = {
        name: "value"
    };

    var data = {
        name: "value",
        func: function testFunction(arg)
        {
            return {
                key: "value"
            };
        },
        subData: JSON.encode(subData)
    };

    var og = encoder.encode(data, {}, {});

console.log(og);

}
