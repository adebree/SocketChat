/*

[ Protocol ]


+ Client requests

login <username>            - logs in with <username>
who                         - server responds with a list of users (one per line)
message <message>           - send a message to the chat, will be broadcasted to all connected clients
exit                        - disconnects
getwork                     - retrieve work
verify <string>             - verify <string> to be the sollution
sethash <hash>              - set a new hash, will cause all work to be flushed
workdone <slots>            - finished working on <slots>

+ Server responses

message <user> <message>    - <user> sended a <message>
connect <user>              - <user> connected
disconnect <user>           - a <user> disconnects
error <message>             - something went wrong
welcome                     - succesfully logged in
ok                          - acknowledgement of client request
work <hash> <slots>         - send work to client to crack <hash> for <slots>, where <slots> is defined as a stringified array of slot numbers
hashfound <username> <hash> <string>    - someone (<username>) found the clear <string> of <hash> 
newhash                     - a newhash has been set, start retrieving work
sendwork <user> <slots>     - sended an array of slots to user to work on
workdone <user> <slots> <hashes per second> - <user> has done working on <slots> and didn't crack the hash

*/

var sys = require( "sys" ) 
  , ws  = require( "websocket-server" );

var server = ws.createServer(
{
    debug: true
} );

/* 
    A slot:
    
    {
        status:     "calculating"
    ,   owner:      "someone"
    }

*/

var cracker = {
    hash: ""
,   slots: []
};

var doneSlotsLastMinute = [];

function broadcastLoggedIn( msg )
{
    server.manager.forEach( function( client )
    {
        if ( client[ "data" ] && client.data[ "username" ] )
        {
            client.write( msg );
        }
    });                     
}

// Handle WebSocket Requests
//
server.addListener( "connection", function( conn )
{    
    conn.data = ( conn.data || {} );

    conn.addListener( "message", function( message )
    {
        var pos = message.indexOf( " " )
          , command;
        
        if ( pos === -1 )
        {
            command = message;
        }
        else
        {
            command = message.substring( 0, pos );
        }
        
        if ( !command )
        {
            this.write( "error didn't receive a command" );
        }
        else
        {
            // Since the remainder of a message will be used by multiple commands, just have it ready for them
            //
            var msg = "";
              
            if ( pos !== -1 )
            {
                msg = message.substring( pos + 1 );
            } 
        
            switch ( command )
            {
                case "login":
                    var username = message.substring( pos + 1 ).split( " " ).shift();
                    
                    if ( pos === -1 || !username )
                    {
                        this.write( "error got command to login, but didn't receive any username" );
                    }
                    else
                    {
                        // Check for uniqueness
                        //
                        var unique = true;
                        
                        server.manager.forEach( function( client )
                        {
                            if ( client[ "data" ] && client.data[ "username" ] && client.data.username === username )
                            {
                                unique = false;
                                return false;
                            }
                        });                  
                        
                        if ( !unique )
                        {      
                            this.write( "error a user with that name is already connected" );
                        }
                        else
                        {
                            this.data.username = username;
                        
                            broadcastLoggedIn( "connect " + username );   
                            this.write( "welcome" );                            
                        }
                    }
                break;
                
                case "who":
                    var username = checkLoggedIn( this );
                    
                    if ( username )
                    {
                        server.manager.forEach( function( client )
                        {
                            if ( client[ "data" ] && client.data[ "username" ] )
                            {
                                conn.write( "user " + client.data.username );
                            }
                        });
                    }
                break;
                
                case "exit":
                    this.close();
                break;                
                
                case "message":
                    var username = checkLoggedIn( this );                
                    
                    if ( username )
                    {
                        this.write( "ok" );
                        broadcastLoggedIn( "message " + username + " " + msg );
                    }
                break;
                
                case "sethash":
                    var username = checkLoggedIn( this );
        
                    if ( username )
                    {
                        cracker.hash = msg;
                        cracker.slots = [];                            
                        
                        broadcastLoggedIn( "newhash" );
                    }
                break;
                
                case "getwork":
                    var username = checkLoggedIn( this );
                    
                    if ( username )
                    {
                        if ( !cracker.hash )
                        {
                            this.write( "error there is no hash to be cracked" );
                        }
                        else
                        {                   
                            // Create 5 slots
                            //
                            var slots = [];
                            
                            for ( var i = 1; i <= 5; i++ )
                            {
                                var newSlot = cracker.slots.length;
                                
                                cracker.slots[ newSlot ] = {
                                    status:     "calculating"
                                ,   owner:      username
                                };
                                
                                slots.push( newSlot );                            
                            }
                            
                            this.write( "work " + cracker.hash + " [" + slots.join( "," ) +"]" );
                            broadcastLoggedIn( "worksend " + username + " [" + slots.join( "," ) +"]" );
                        }
                    }
                break;
                
                case "verify":
                    var username = checkLoggedIn( this );
                    
                    if ( username )
                    {                        
                        if ( md5( msg ) !== cracker.hash )
                        {
                            this.write( "error provided string is not the correct one" );
                        }
                        else
                        {
                            broadcastLoggedIn( "hashfound " + username + " " + cracker.hash + " " + msg );
                            
                            cracker.hash  = "";
                            cracker.slots = [];
                        }
                    }
                break;

                case "workdone":

                    var username = checkLoggedIn( this );

                    if ( username )
                    {
                        var slots = eval( message.substring( pos + 1 ) )
                          , error = false
                          , slotsDone = []
                          , now = +new Date();

                        for ( var i = 0, l = slots.length; i < l; i++ )
                        {
                            var slot = slots[ i ];
                            
                            if ( username !== cracker.slots[ slot ].owner )
                            {
                                broadcastLoggedIn( "error " + username + " tries to flag work done which wasn't his/hers" );
                            }
                            else if ( slot !== 0 )
                            {
                                slotsDone.push( slot );
                                doneSlotsLastMinute.push( now );

                                cracker.slots[ slot ].status = "done";
                            }
                        }

                        var expiredSlots = 0
                          , old = now - 60*1000;

                        for ( var i = 0, l = doneSlotsLastMinute.length; i < l; i++ )
                        {
                            if ( old > doneSlotsLastMinute[ i ] )
                            {
                                expiredSlots++;
                            }
                            else
                            {
                                break;
                            }
                        }

                        while ( expiredSlots-- )
                        {
                            doneSlotsLastMinute.shift();
                        }

                        if ( slotsDone.length )
                        {
                            var hashesPerSec = parseInt( 500000 * ( doneSlotsLastMinute.length ) / 60, 10 ); // 500000 is the slot size

                            broadcastLoggedIn( "workdone " + username + " [" + slots.join( "," ) +"] "+ hashesPerSec );
                        }

                    }
                break;
                
                default:
                    this.write( "error received unkown command" );
            }
        }
    });
    
    conn.addListener( "close", function()
    {
        var username = this.data[ "username" ];
        
        if ( username )
        {
            broadcastLoggedIn( "disconnect " + username )   
        }
    });
});

// Validate if a connection is already logged in, sends out an error when not
// Returns the username if found
//
function checkLoggedIn( conn )
{
    var username = conn.data[ "username" ];
    
    if ( !username )
    {
        conn.write( "error login first" );
    }
    
    return username;
}

// Catch all errors and write them to the console
//
server.addListener( "error", function()
{
    console.log( Array.prototype.join.call( arguments, ", " ) );
});

server.listen( 8080 );



// ------------------------------ //

//http://www.myersdaily.org/joseph/javascript/md5.js
function md5cycle(x, k) {
var a = x[0], b = x[1], c = x[2], d = x[3];

a = ff(a, b, c, d, k[0], 7, -680876936);
d = ff(d, a, b, c, k[1], 12, -389564586);
c = ff(c, d, a, b, k[2], 17,  606105819);
b = ff(b, c, d, a, k[3], 22, -1044525330);
a = ff(a, b, c, d, k[4], 7, -176418897);
d = ff(d, a, b, c, k[5], 12,  1200080426);
c = ff(c, d, a, b, k[6], 17, -1473231341);
b = ff(b, c, d, a, k[7], 22, -45705983);
a = ff(a, b, c, d, k[8], 7,  1770035416);
d = ff(d, a, b, c, k[9], 12, -1958414417);
c = ff(c, d, a, b, k[10], 17, -42063);
b = ff(b, c, d, a, k[11], 22, -1990404162);
a = ff(a, b, c, d, k[12], 7,  1804603682);
d = ff(d, a, b, c, k[13], 12, -40341101);
c = ff(c, d, a, b, k[14], 17, -1502002290);
b = ff(b, c, d, a, k[15], 22,  1236535329);

a = gg(a, b, c, d, k[1], 5, -165796510);
d = gg(d, a, b, c, k[6], 9, -1069501632);
c = gg(c, d, a, b, k[11], 14,  643717713);
b = gg(b, c, d, a, k[0], 20, -373897302);
a = gg(a, b, c, d, k[5], 5, -701558691);
d = gg(d, a, b, c, k[10], 9,  38016083);
c = gg(c, d, a, b, k[15], 14, -660478335);
b = gg(b, c, d, a, k[4], 20, -405537848);
a = gg(a, b, c, d, k[9], 5,  568446438);
d = gg(d, a, b, c, k[14], 9, -1019803690);
c = gg(c, d, a, b, k[3], 14, -187363961);
b = gg(b, c, d, a, k[8], 20,  1163531501);
a = gg(a, b, c, d, k[13], 5, -1444681467);
d = gg(d, a, b, c, k[2], 9, -51403784);
c = gg(c, d, a, b, k[7], 14,  1735328473);
b = gg(b, c, d, a, k[12], 20, -1926607734);

a = hh(a, b, c, d, k[5], 4, -378558);
d = hh(d, a, b, c, k[8], 11, -2022574463);
c = hh(c, d, a, b, k[11], 16,  1839030562);
b = hh(b, c, d, a, k[14], 23, -35309556);
a = hh(a, b, c, d, k[1], 4, -1530992060);
d = hh(d, a, b, c, k[4], 11,  1272893353);
c = hh(c, d, a, b, k[7], 16, -155497632);
b = hh(b, c, d, a, k[10], 23, -1094730640);
a = hh(a, b, c, d, k[13], 4,  681279174);
d = hh(d, a, b, c, k[0], 11, -358537222);
c = hh(c, d, a, b, k[3], 16, -722521979);
b = hh(b, c, d, a, k[6], 23,  76029189);
a = hh(a, b, c, d, k[9], 4, -640364487);
d = hh(d, a, b, c, k[12], 11, -421815835);
c = hh(c, d, a, b, k[15], 16,  530742520);
b = hh(b, c, d, a, k[2], 23, -995338651);

a = ii(a, b, c, d, k[0], 6, -198630844);
d = ii(d, a, b, c, k[7], 10,  1126891415);
c = ii(c, d, a, b, k[14], 15, -1416354905);
b = ii(b, c, d, a, k[5], 21, -57434055);
a = ii(a, b, c, d, k[12], 6,  1700485571);
d = ii(d, a, b, c, k[3], 10, -1894986606);
c = ii(c, d, a, b, k[10], 15, -1051523);
b = ii(b, c, d, a, k[1], 21, -2054922799);
a = ii(a, b, c, d, k[8], 6,  1873313359);
d = ii(d, a, b, c, k[15], 10, -30611744);
c = ii(c, d, a, b, k[6], 15, -1560198380);
b = ii(b, c, d, a, k[13], 21,  1309151649);
a = ii(a, b, c, d, k[4], 6, -145523070);
d = ii(d, a, b, c, k[11], 10, -1120210379);
c = ii(c, d, a, b, k[2], 15,  718787259);
b = ii(b, c, d, a, k[9], 21, -343485551);

x[0] = add32(a, x[0]);
x[1] = add32(b, x[1]);
x[2] = add32(c, x[2]);
x[3] = add32(d, x[3]);

}

function cmn(q, a, b, x, s, t) {
a = add32(add32(a, q), add32(x, t));
return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) {
return cmn((b & c) | ((~b) & d), a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
return cmn((b & d) | (c & (~d)), a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
return cmn(c ^ (b | (~d)), a, b, x, s, t);
}

function md51(s) {
txt = '';
var n = s.length,
state = [1732584193, -271733879, -1732584194, 271733878], i;
for (i=64; i<=s.length; i+=64) {
md5cycle(state, md5blk(s.substring(i-64, i)));
}
s = s.substring(i-64);
var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
for (i=0; i<s.length; i++)
tail[i>>2] |= s.charCodeAt(i) << ((i%4) << 3);
tail[i>>2] |= 0x80 << ((i%4) << 3);
if (i > 55) {
md5cycle(state, tail);
for (i=0; i<16; i++) tail[i] = 0;
}
tail[14] = n*8;
md5cycle(state, tail);
return state;
}

/* there needs to be support for Unicode here,
 * unless we pretend that we can redefine the MD-5
 * algorithm for multi-byte characters (perhaps
 * by adding every four 16-bit characters and
 * shortening the sum to 32 bits). Otherwise
 * I suggest performing MD-5 as if every character
 * was two bytes--e.g., 0040 0025 = @%--but then
 * how will an ordinary MD-5 sum be matched?
 * There is no way to standardize text to something
 * like UTF-8 before transformation; speed cost is
 * utterly prohibitive. The JavaScript standard
 * itself needs to look at this: it should start
 * providing access to strings as preformed UTF-8
 * 8-bit unsigned value arrays.
 */
function md5blk(s) { /* I figured global was faster.   */
var md5blks = [], i; /* Andy King said do it this way. */
for (i=0; i<64; i+=4) {
md5blks[i>>2] = s.charCodeAt(i)
+ (s.charCodeAt(i+1) << 8)
+ (s.charCodeAt(i+2) << 16)
+ (s.charCodeAt(i+3) << 24);
}
return md5blks;
}

var hex_chr = '0123456789abcdef'.split('');

function rhex(n)
{
var s='', j=0;
for(; j<4; j++)
s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
+ hex_chr[(n >> (j * 8)) & 0x0F];
return s;
}

function hex(x) {
for (var i=0; i<x.length; i++)
x[i] = rhex(x[i]);
return x.join('');
}

function md5(s) {
return hex(md51(s));
}

/* this function is much faster,
so if possible we use it. Some IEs
are the only ones I know of that
need the idiotic second function,
generated by an if clause.  */

function add32(a, b) {
return (a + b) & 0xFFFFFFFF;
}

if (md5('hello') != '5d41402abc4b2a76b9719d911017c592') {
function add32(x, y) {
var lsw = (x & 0xFFFF) + (y & 0xFFFF),
msw = (x >> 16) + (y >> 16) + (lsw >> 16);
return (msw << 16) | (lsw & 0xFFFF);
}
}