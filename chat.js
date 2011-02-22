;(function() {
    var server = "...";

    var myHistory           = document.querySelector( ".chatPane .history" )
      , myInputForm         = document.querySelector( ".inputPane form.command" )
      , btnLogoff           = document.querySelector( ".inputPane input.logoff" )      
      , myLoginForm         = document.querySelector( ".inputPane form.login" )
      , myUsersList         = document.querySelector( ".userPane ul.users" )      
      , myInput             = myInputForm.querySelector( "input.command" )
      , myLoginInput        = myLoginForm.querySelector( "input.username" )      
      , myOnlineIndicator   = document.querySelector( ".status .online .indicator" )
      , myActivityIndicator = document.querySelector( ".status .activity .indicator" )      
      , btnConnect          = document.getElementById( "btnConnect" )
      , connected           = false
      , myUsername
      , nrBlinks
      , tmrBlink
      , connection;  
      
    function history( type, data )
    {
        var prefix   = ""
          , classes  = [];
          
        classes.push( "chatLine" );
        
        if ( typeof data === "string" )
        {
            data = { msg: data };
        }
        
        switch ( type )
        {
            case "system":
                prefix = "--";
                classes.push( "system" );
            break;
            
            case "error":
                prefix = "[ERROR]";
                classes.push( "error" );                
            break;
            
            case "hashfound":
                prefix = "[HASH FOUND] >> [" + data.str + "] by " + data.user;
                classes.push( "hashfound" );                 
            break;
            
            case "message":
                prefix = "[" + data.user + "]";
                if ( data.user === myUsername )
                {
                    classes.push( "me" );
                }
            break;
        }
        
        var line = document.createElement( "span" );
        line.setAttribute( "class", classes.join( " " ) );        
        
        var text = document.createTextNode( prefix + " " + data[ "msg" ] );
        line.appendChild( text );
        
        myHistory.appendChild( line );
        
            myHistory.scrollTop = myHistory.scrollHeight;
    }        
    
    function startBlinking()
    {
        clearTimeout( tmrBlink );
        
        nrBlinks = 3 * 2;    
        
        blinkActivity();
    }
    
    function blinkActivity()
    {
        nrBlinks--;
        
        var classes = [ "indicator" ];
        
        if ( nrBlinks > 0 )
        {
            if ( nrBlinks % 2 !== 0 )
            {
                classes.push( "blue" );
            }
            
            tmrBlink = setTimeout( blinkActivity, 200 );
        }
        
        myActivityIndicator.setAttribute( "class", classes.join( " " ) );                    
    }
    
    // Add a user to the userslist
    //
    function addUserToList( username )
    {
        var userLine = document.createElement( "li" );
        userLine.appendChild( document.createTextNode( username ));
    
        var users = myUsersList.childNodes;
        
        var added = false;
      
        // Itterate over the current users to insert the user
        // at the right location in the list
        //  
        for ( var i = 0, l = users.length; i < l; i++ )
        {
            var user = users[ i ];
            
            // Do not add when already present
            //
            if ( username == user.innerHTML )
            {
                added = true;
                break;
            }
            else if ( username < user.innerHTML )
            {
                myUsersList.insertBefore( userLine, user );
                added = true;
                break;
            }
        }
        
        // Not added yet? It is the last in the list
        //
        if ( !added )
        {
            myUsersList.appendChild( userLine );
        }    
    }
    
    function removeUserFromList( username )
    {
        var users = myUsersList.childNodes;
        
        for ( var i = 0, l = users.length; i < l; i++ )
        {
            var user = users[ i ];
            
            if ( username == user.innerHTML )
            {
                myUsersList.removeChild( user );
                break;
            }
        }    
    }
    
    function connect() 
    {        
        connection = new WebSocket( "ws://" + server );
        
        connection.onerror = function()
        {
            history( "error", arguments.join( ", " ) );
        }
        
        connection.onopen = function()
        {
            history( "system", "connection opened to: " + server );
            myOnlineIndicator.setAttribute( "class", "indicator orange" );
            connected = true;
        }
    
        connection.onclose = function()
        {
            history( "system", "connection closed" );
            myOnlineIndicator.setAttribute( "class", "indicator red" );            
            
            document.querySelector( ".userPane > div" ).style.display = "none";            
            while ( myUsersList.hasChildNodes() )
            { 
                myUsersList.removeChild( myUsersList.firstChild );
            }

            connected = false;    
            
            myInputForm.style.display = "none";
            myLoginForm.style.display = "block";     
            
            myLoginInput.focus();        
            
            // Reconnect
            //
            connect();
        }
        
        connection.onmessage = function( e )
        {
            console.log( e.data );
            
            startBlinking();
            
            var pos = e.data.indexOf( " " );
            
            if ( pos === -1 )
            {
                pos = e.data.length;
            }
            
            var type      = e.data.substring( 0, pos )
              , remainder = e.data.substring( pos + 1 );
        
            switch ( type )
            {
                case "welcome":
                    history( "system", "Successfully logged in" );
                    
                    while ( myUsersList.hasChildNodes() )
                    { 
                        myUsersList.removeChild( myUsersList.firstChild );
                    }

                    myUsername = myLoginInput.value;

                    send( "/who" );
                    
                    myOnlineIndicator.setAttribute( "class", "indicator green" );                                
                    
                    document.querySelector( ".userPane > div" ).style.display = "block";
                    
                    myInputForm.style.display = "block";
                    myLoginForm.style.display = "none";     
                    
                    myInput.focus();        
                break;            
                
                case "user":
                    addUserToList( remainder );
                break;
            
                case "connect":
                    history( "system", "User logged in: " + remainder );
                    addUserToList( remainder );
                break;
                
                case "disconnect":
                    history( "system", "User disconnected: " + remainder );
                    removeUserFromList( remainder );
                break;                
            
                case "error":
                    history( type, remainder );
                break;
                                
                case "message":
                    pos = remainder.indexOf( " " );
                    
                    var user = remainder.substring( 0, pos )
                      , msg  = remainder.substring( pos + 1 );
                
                    history( 
                        type
                    ,   { 
                            user:  user
                        ,   msg:   msg  
                        }
                    );
                break;
                
                /* cracker */
                
                case "newhash":
                    stopCracking();
                    
                    connection.send( "getwork" );
                break;
                
                case "work":
                    if ( pos !== -1 )
                    {
                        pos = remainder.indexOf( " " );
                        
                        var hash  = remainder.substring( 0, pos )
                          , slots = JSON.parse( remainder.substring( pos + 1 ) );
                          
                        myHash.innerHTML = " | Current hash: " + hash;
                    
                        document.querySelector( ".crackPane" ).style.display = "block";

                        doCrack( hash, slots );                        
                    }                    
                break;
                
                case "hashfound":
                    pos = remainder.indexOf( " " );
                    
                    var user      = remainder.substring( 0, pos )
                      , remainder = remainder.substring( pos + 1 )
                      , pos       = remainder.indexOf( " " )
                      , hash      = remainder.substring( 0, pos )
                      , str       = remainder.substring( pos + 1 );
                
                    history(
                        type
                    ,   {
                            user:   user
                        ,   str:    str
                        ,   msg:    ""
                        ,   hash:   hash
                        }
                    );
                    
                    stopCracking();
                break;

                case "worksend":
                    pos = remainder.indexOf( " " );

                    var user  = remainder.substring( 0, pos )
                      , slots = JSON.parse( remainder.substring( pos + 1 ));
                      
                    crackHistory(
                        type
                    ,   {
                            user:   user
                        ,   slots:  slots
                        }
                    )
                break;

                case "workdone":
                    pos = remainder.indexOf( " " );

                    var user        = remainder.substring( 0, pos )
                      , remainder   = remainder.substring( pos + 1 )
                      , pos         = remainder.indexOf( " " )
                      , slots       = JSON.parse( remainder.substring( 0, pos ))
                      , hashesPerSecond = remainder.substring( pos + 1 );

                    nrHashesGlobal.innerHTML = " / " + hashesPerSecond +" (global)";


                    crackHistory(
                        type
                    ,   {
                            user:   user
                        ,   slots:  slots
                        }
                    )
                break;
            }
        }
    }
    
    function disconnect() 
    {
        connection.close();
    }
    
    function send( value )
    {
       if ( !connected )
        {
            history( "system", "not connected" );
        }
        else
        {            
            var message;
            
            if ( value.charAt( 0 ) !== "/" )
            {
                message = "message " + value;
            }
            else
            {
                message = value.substring( 1 );
            }
            
            connection.send( message );
        }
    
    }
    
    function init()
    {
        history( "system", "Welcome to socket chat" );
        
        connect();
        
        myLoginInput.focus();
    }
    
    
    // Event listeners
    //
    myInputForm.onsubmit = function( e )
    {
        e.preventDefault();
        
        var value = myInput.value;
        myInput.value = "";        
            
        send( value );
        
        return false;
    }
    
    myLoginForm.onsubmit = function( e )
    {
        e.preventDefault();
        
        var value = myLoginInput.value;
            
        send( "/login " + value );
        
        return false;
    }
    
    btnLogoff.onclick = function()
    {
        disconnect();
    }
    
    /* cracker */
    
    var myCrackHistory      = document.querySelector( ".crackPane .history" )
      , nrHashesLocal       = document.querySelector( ".crackPane .nrHashesLocal" )
      , nrHashesGlobal      = document.querySelector( ".crackPane .nrHashesGlobal" )
      , myHash              = document.querySelector( ".crackPane .hash" )      
      , worker
      , lastSlotStarted
      , active = false;
      
    function crackHistory( type, data )
    {
        var prefix   = ""
          , classes  = [];
          
        classes.push( "crackLine" );
        
        if ( typeof data !== "object" )
        {
            data = { msg: data };
        }
        
        switch ( type )
        {
            case "system":
                prefix = "--";
                classes.push( "system" );
            break;
            
            case "newslot":
                prefix = "[SLOT] Processing slot ";
                classes.push( "slot" );
            break;

            case "worksend":
                prefix = "[WORK] " + data.user + " started working on slots [" + data.slots.join( "," ) + "]";

                data.user === myUsername
                    ? classes.push( "mywork" )
                    : classes.push( "work" );
            break;

            case "workdone":
                prefix = "[WORK] " + data.user + " finished working on slots [" + data.slots.join( "," ) + "]";

                data.user === myUsername
                    ? classes.push( "mywork" )
                    : classes.push( "work" );
            break;
            
            case "morework":
                prefix = "[DONE] All work done, ask for more work";
            break;
            
            case "verify":
                prefix = "[VERIFY]";
            break;            
            
            case "error":
                prefix = "[ERROR]";
                classes.push( "error" );                
            break;            
        }
        
        var msg = prefix;
        
        if ( data[ "msg" ] )
        {
            msg += " " + data.msg;
        }
        
        var line = document.createElement( "span" );
        line.setAttribute( "class", classes.join( " " ) );        
        
        var text = document.createTextNode( msg );
        line.appendChild( text );
        
        myCrackHistory.appendChild( line );
        
        myCrackHistory.scrollTop = myCrackHistory.scrollHeight;
    }

    function setupWorker()
    {
        // Create the worker and bind event handlers to it
        //
        worker = new Worker( "../../webworkers/partioned_cracker/worker.js?" +(+new Date()) );

        // The worker communicates back using JSON'ified messages
        // All messages contain a type to specify what kind of message it is
        //
        // There are 4 message types:
        // - log        a convenience function for printing to console.log from inside the worker
        // - newslot    progress notification, the worker has start working on a new slot
        // - result     the worker has finished, The result message contains a 'state' attribute to
        //              indicate whether if succesfull ("succes") or not ("not found").
        //              When state is "success" the found clear string is in "result".
        //
        worker.onmessage = function( e )
        {
            var msg = JSON.parse( e.data );

            switch ( msg[ "type" ] )
            {
                case "log":
                    console.log( msg[ "message" ] );
                break;

                case "newslot":

                    if ( msg.slot === 0 )
                    {
                        break;
                    }

                    crackHistory( "newslot", ""+ msg.slot );

                    // Calculate the number of hashes per second
                    //
                    var now = +new Date();

                    if ( lastSlotStarted )
                    {
                        var diff = now - lastSlotStarted
                          , hashesPerSecond = parseInt( 500000 / diff * 1000, 10 ); // 100000 is the slot size

                        nrHashesLocal.innerHTML = " " + hashesPerSecond +" (local) ";
                    }

                    lastSlotStarted = now;
                break;

                case "result":
                    if ( "success" === msg.state )
                    {
                        crackHistory( "verify", msg.result );

                        connection.send( "verify " + msg.result );
                    }
                    else
                    {
                        crackHistory( "morework" );

                        connection.send( "workdone [" + msg.slots.join( "," ) +"]" );
                        connection.send( "getwork" );
                    }
                break;
            }
        }

        worker.onerror = function( e )
        {
           console.log( "Error in worker: ", e );
        }   	    
    }
      	    
    
    function doCrack( hash, slots )
    {
        if ( !worker  )
        {
            setupWorker();
        }
        
        // All setup done, push work to the worker
        //
        startCracking( hash, slots );
    }
            
    // Send a message to the worker to start cracking on 'hash' for the specified slots
    //
    function startCracking( hash, slots )
    {
        worker.postMessage( JSON.stringify(
        {
            command:    "start"
        ,   hash:       hash
        ,   slots:      slots
        } ));        
        
        active = true;                   
    }
    
    // Stop the cracking by therminating the worker
    //
    function stopCracking()
    {
        if ( worker )
        {
            worker.terminate();

            worker = undefined;
        }
        
        active = false;
    }    
    
    
    // Engage!
    //
    window.onload = init;
})();