// TODO: More variants, by game ID, sharing / social integration.
// TODO: Play AI if no opponent found in n minutes
// TODO: Ensure reusability of interface for another game
var setup_complete = false, gameRef = undefined;

// jQuery mixin to remove all classes with prefix.
$.fn.removeClassPrefix = function(prefix) {
	// From http://stackoverflow.com/questions/57812/remove-all-classes-that-begin-with-a-certain-string.
    this.each(function(i, el) {
        var classes = el.className.split(" ").filter(function(c) {
            return c.lastIndexOf(prefix, 0) !== 0;
        });
        el.className = $.trim(classes.join(" "));
    });
    return this;
};

// LZW-compress a string
function lzw_encode(s) {
	// From https://gist.github.com/revolunet/843889.
    var dict = {};
    var data = (s + "").split("");
    var out = [];
    var currChar;
    var phrase = data[0];
    var code = 256;
    for (var i=1; i<data.length; i++) {
        currChar=data[i];
        if (dict[phrase + currChar] != null) {
            phrase += currChar;
        }
        else {
            out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
            dict[phrase + currChar] = code;
            code++;
            phrase=currChar;
        }
    }
    out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
    for (var i=0; i<out.length; i++) {
        out[i] = String.fromCharCode(out[i]);
    }
    return out.join("");
}

// Decompress an LZW-encoded string
function lzw_decode(s) {
	// From https://gist.github.com/revolunet/843889.
    var dict = {};
    var data = (s + "").split("");
    var currChar = data[0];
    var oldPhrase = currChar;
    var out = [currChar];
    var code = 256;
    var phrase;
    for (var i=1; i<data.length; i++) {
        var currCode = data[i].charCodeAt(0);
        if (currCode < 256) {
            phrase = data[i];
        }
        else {
           phrase = dict[currCode] ? dict[currCode] : (oldPhrase + currChar);
        }
        out.push(phrase);
        currChar = phrase.charAt(0);
        dict[code] = oldPhrase + currChar;
        code++;
        oldPhrase = phrase;
    }
    return out.join("");
}

$(document).ready(function() {
	// Create a redux store.
    var initialState = {
        "user_info": {},
        "game_state": {},
        "hit_string": "",
        "their_fired": [],
        "our_fired": []
    }
    initialState["ai_state"] = jQuery.extend(true, {}, initialState);
	var store_handler = function(state = initialState, action){
		var type = action.type;
        var main_ret = jQuery.extend(true, {}, state);
        var ret = main_ret;
        var ai = false;
        if(type.indexOf("AI_") === 0){
            type = type.substr(3);
            ai = true;
            ret = main_ret.ai_state;
        }
		if(type === "STORE_USER_INFO"){
			ret["user_info"] = action.data;
		} else if(type === "UPDATE_GAME_STATE"){
			ret["game_state"] = action.data;
		} else if(type === "SET_HIT_STRING"){
			ret["hit_string"] = action.data;
		} else if(type === "UPDATE_THEIR_FIRED_SQUARES"){
            Array.prototype.push.apply(ret["their_fired"], action.data);
        } else if(type === "UPDATE_OUR_FIRED_SQUARES"){
            console.log("Updating our fired squares", ai);
            Array.prototype.push.apply(ret["our_fired"], action.data);
        }
        return main_ret;
	}
	var store = Redux.createStore(store_handler);

    // Implement game AI. //
    var interesting_keys = ["turn_end_key", "broadcast_action"];
    var all_ships = [
		["Carrier", 5],
		["Battleship", 4],
		["Cruiser", 3],
		["Submarine", 3],
		["Destroyer", 2]
	];
    var startGameAi = function(already_hosting, data){
        // TODO: Ensure emulator complete, responds to all necessary events, broadcasted
        // or otherwise, and sends necessary events (e.g. game over, etc.)
        // Inform user of choice.
        $('#dialogModal').find('.dialog-modal-header').text("Paired with AI");
        $('#dialogModal').find('.dialog-modal-subheader').text("Due to not finding an opponent in a reasonable amount of time, you have been paired with a Battleboat Al. Will the robots be our new overlords? Let's find out!");
        $('#dialogModal').fadeIn();

        // Define master AI game handler.
        var aiRef = undefined;
        var ai_store = store;
        var probabilityDensityCalc = function(hit_map){
            // Figure out which of their ships are alive.
            var cur_state = ai_store.getState().ai_state;
            var our_fired = cur_state.our_fired;
            var hits_by_ship = {};
            our_fired.map(function(val) {
                if(val.ship){
                    val.ship = val.ship.toLowerCase();
                    if(val.ship in hits_by_ship){
                        hits_by_ship[val.ship] += 1;
                    } else {
                        hits_by_ship[val.ship] = 1;
                    }
                }
            });
            var extant_ships = all_ships
                .filter(function(arr){
                    var ship_type = arr[0].toLowerCase();
                    var hits;
                    if(ship_type in hits_by_ship){
                        hits = hits_by_ship[ship_type];
                    } else {
                        hits = 0;
                    }
                    return hits < arr[1];
                })
                .map(function(arr){
                    return [arr[0].toLowerCase(), arr[1]];
                })
            ;
            var extant_ship_names = extant_ships.map(function(arr){
                return arr[0];
            });
            var destroyed_ship_names = all_ships
                .filter(function(arr){
                    return extant_ship_names.indexOf(arr[0].toLowerCase()) === -1;
                })
                .map(function(arr){
                    return arr[0].toLowerCase();
                })
            ;
            console.log("Their extant ships", extant_ships);

            // Initialize probability density function matrix.
            var density_function = [];
            var tens = [0,1,2,3,4,5,6,7,8,9];
            density_function = tens.map(function(val){
                return tens.map(function(){ return 0; });
            });

            // Populate probability density function matrix.
            var obstructions_json = our_fired
                .filter(function(val){
                    // Misses and destroyed ships count as obstructions.
                    return !val.hasOwnProperty("ship") ||
                           destroyed_ship_names.indexOf(val.ship.toLowerCase()) !== -1;
                })
                .map(function(val){
                    return JSON.stringify(val.square);
                })
            ;
            var non_destroyed_json = our_fired
                .filter(function(val){
                    return val.hasOwnProperty("ship") &&
                           destroyed_ship_names.indexOf(val.ship.toLowerCase()) === -1;
                })
                .map(function(val){
                    return JSON.stringify(val.square);
                })
            ;
            var non_destroyed_bonus = 50; // score weightage granted for ship passing through non-destroyed point
            //console.log("our fired", our_fired);
            for(let on_arr of extant_ships){
                var ship_type = on_arr[0], length = on_arr[1];
                for(var orientation = 0; orientation < 2; orientation++){
                    for(var r = 0; r < 10; r++){
                        for(var c = 0; c < 10; c++){
                            // Filter out-of-bounds positions.
                            var end_r = r, end_c = c;
                            if(orientation == 0) end_c += (length - 1);
                            if(orientation == 1) end_r += (length - 1);
                            if(end_r > 9 || end_c > 9) continue;

                            // Generate list of occupied squares.
                            var squares = [];
                            for(var i = r; i <= end_r; i++){
                                for(var j = c; j <= end_c; j++){
                                    squares.push([i, j]);
                                }
                            }

                            // Filter squares that the ship cannot be placed
                            // at.
                            var occ_squares = squares
                                .map(function(val){
                                    return JSON.stringify(val);
                                })
                                .filter(function(val){
                                    return obstructions_json.indexOf(val) !== -1;
                                })
                            ;
                            if(occ_squares.length > 0){
                                continue;
                            }

                            // Check if ship passes through a non-destroyed ship square.
                            var score = 1;
                            var non_destroyed_squares_passing = squares
                                .map(function(val){
                                    return JSON.stringify(val);
                                })
                                .filter(function(val){
                                    return non_destroyed_json.indexOf(val) !== -1;
                                })
                            ;
                            score += non_destroyed_bonus * non_destroyed_squares_passing.length;

                            // Increment counters.
                            for(let pos of squares){
                                density_function[pos[0]][pos[1]] += score;
                            }
                        }
                    }
                }
            }
            console.log("Final probability density function", density_function);

            // Select the maxes in descending order of the probability density
            // function until arriving at a square that we have not yet fired
            // at.
            var our_fired_json = our_fired.map(function(val){
                return JSON.stringify(val.square);
            });
            var sorted = [];
            for(var r = 0; r < 10; r++){
                for(var c = 0; c < 10; c++){
                    sorted.push([
                        [r, c],
                        density_function[r][c]
                    ])
                }
            }
            sorted = sorted.filter(function(val){
                return our_fired_json.indexOf(JSON.stringify(val[0])) === -1;
            });
            sorted.sort(function(a, b){
                // Flipped to do an ascending sort.
                if(a[1] < b[1]){
                    return 1;
                } else if(a[1] > b[1]){
                    return -1;
                } else return 0;
            });
            console.log("Density function maxes", sorted);

            // Select as many maxes as applicable to the current
            // game mode.
            var allowed_count = 0;
            if(cur_state.game_state.mode === "regular") allowed_count = 1;
            else if(cur_state.game_state.mode === "salvo"){
                var their_fired_json = ai_store.getState().ai_state.their_fired
                    .map(function(val) {
                        return JSON.stringify(val.square);
                    })
                ;
                var our_extant_ships = 0;
                for(var ship_type in hit_map){
                    var alive_squares = hit_map[ship_type]
                        .map(function(val){
                            return JSON.stringify(val);
                        })
                        .filter(function(val){
                            return their_fired_json.indexOf(val) === -1;
                        })
                    ;
                    if(alive_squares.length > 0) ++our_extant_ships;
                }
                allowed_count = our_extant_ships;
            }
            var final_guesses = [];
            for(var i = 0; i < allowed_count; i++){
                final_guesses.push(sorted[i][0]);
            }
            console.log("Final guesses", final_guesses);
            return final_guesses;
        }
        var masterAiHandler = function(changed_data){
            // Check if the event is interesting (e.g. worth a database fetch).
    		var key = changed_data.getKey();
    		if(interesting_keys.indexOf(key) === -1) return;
            //console.log("Current AI state", ai_store.getState().ai_state);
            //console.log("Current AI stats:", ai_store.getState().ai_state.our_fired, ai_store.getState().ai_state.our_fired.length);
    		//console.log(key);

            // Handle special actions here.
            if(key === "broadcast_action"){
    			var action = changed_data.val();
    			if(action === "setup"){
    				// Decide on ship positions.
                    var shipPositions = {};
                    var occupied = [];
                    for(var i = 0; i < all_ships.length; i++){
                        var ship_type = all_ships[i][0].toLowerCase();
                        var length = all_ships[i][1];

                        // Place this somewhere random and available.
                        var placed = false, occ = [];
                        while(!placed){
                            var r = Math.floor(Math.random() * 10);
                            var c = Math.floor(Math.random() * 10);
                            var orientation = Math.floor(Math.random() * 2); // 0 = horizontal, 1 = vertical
                            occ = [];
                            if(orientation == 0){
                                // Horizontal
                                for(var j = c; j < (c + length); j++){
                                    occ.push([r, j]);
                                }
                            } else if(orientation == 1){
                                // Vertical
                                for(var j = r; j < (r + length); j++){
                                    occ.push([j, c]);
                                }
                            }
                            var passed = true;
                            for(let sq of occ){
                                if(sq[0] > 9 || sq[1] > 9){
                                    passed = false;
                                    break;
                                }
                            }
                            if(!passed) continue;
                            var clashing = occ.filter(function(val) {
                                return occupied.indexOf(JSON.stringify(val)) !== -1;
                            });
                            if(clashing.length == 0){
                                //
                                console.log("AI: Placed " + ship_type + " at [" + r + ", " + c + "] with orientation " + orientation);
                                //
                                placed = true;
                            }
                        }

                        // Save the placement.
                        shipPositions[ship_type] = occ;
                        occ.map(function(val){
                            occupied.push(JSON.stringify(val));
                        });
                    }

                    // Broadcast that we are done with setup.
                    setTimeout(function() {
                        // Save to database.
                        var updates = {};
                        var are_we_client = already_hosting;
                        var user_num = (are_we_client ? "1" : "0");
                        var user_int = parseInt(user_num);
                        var hit_str = generateHitString(shipPositions);
                        updates['board_state/0/1/' + user_num] = "no_hit_str"; // keep hit string private for security purposes
                        updates['user_states/' + user_num] = "SETUP_COMPLETE";
                        updates['broadcast_action'] = "setup_ended_" + (are_we_client ? "client" : "host");
                        aiRef.update(updates);

                        // Store hit string in private store.
                        ai_store.dispatch({ type: "AI_SET_HIT_STRING", data: hit_str });

                        // Make first turn if we are host.
                        if(!already_hosting){
                            // Calculate response using a probability density function. //
                            var final_guesses = probabilityDensityCalc(shipPositions);

                            // Send response with a time delay.
                            setTimeout(function() {
                                // Transmit response.
                                var newHistRef = aiRef.child("/board_state/1/1").push();
                                newHistRef.set([
                                	"host",
                                	final_guesses
                                ]);
                                var updates = {};
                                updates['turn_end_key'] = [
                                	newHistRef.key,
                                	(are_we_client ? "client" : "host"),
                                	"done_firing"
                                ];
                                aiRef.update(updates);
                            }, 6500);
                        }
                    }, 1500);

    				// Allow current game state to be saved. -
    			}
            }

    		// Grab current game state from database.
    		aiRef.once("value", function(data) {
    			// Get current game state.
    			var cur_state = ai_store.getState().ai_state;
    			var game_state = cur_state.game_state;
    			var are_we_client = cur_state.game_state.client;

    			// Retrieve value from reference.
    			data = data.val();
    			console.log("Master AI handler", data);

    			// Update store as necessary.
    			var new_state = {
    				"client": already_hosting,
    				"mode": data.mode,
    				"board_state": data.board_state,
    			};

    			// Send new state to store.
    			ai_store.dispatch({type: "AI_UPDATE_GAME_STATE", data: new_state});
                if(key === "turn_end_key"){
    				var turn_data = changed_data.val();
    				var turn_key = turn_data[0];
    				var whose_turn = turn_data[1], turn_type = turn_data[2];
    				var our_turn = (are_we_client ? "client" : "host");
                    //console.log("AI Turns:", whose_turn, our_turn);
    				if(whose_turn !== our_turn){ // don't respond to our own events
    					if(turn_type === "done_firing"){
    						// Retrieve our current hit state.
    						var hit_map = parseHitString(cur_state.hit_string);

    						// Retrieve the squares they fired on.
    						var fired_squares = data.board_state[1][1][turn_key][1];

    						// Count how many squares were hit, and belonging to
    						// which ship.
    						var hitMissShip = [];
    						for(var i = 0; i < fired_squares.length; i++){
    							var on = JSON.stringify(fired_squares[i]);
    							var ship_hit = undefined, square_hit = false;
    							for(var ship_name in hit_map){
    								var hit = (hit_map[ship_name].map(function(val) {
    									return JSON.stringify(val);
    								}).indexOf(on)) !== -1;
    								if(hit){
    									ship_hit = ship_name;
    									square_hit = true;
    									break;
    								}
    							}
                                var pushing = {
    								square: fired_squares[i],
    								hit: square_hit
    							};
                                if(square_hit){
                                    pushing["ship"] = ship_hit;
                                }
    							hitMissShip.push(pushing);
    						}

                            // Save fired squares to private store.
                            ai_store.dispatch({ type: "AI_UPDATE_THEIR_FIRED_SQUARES", data: hitMissShip });

    						// Transmit which squares were hit.
    						var newHistRef = aiRef.child("board_state/1/1").push();
    						newHistRef.set([
    							(+ are_we_client), // cast bool to int
    							hitMissShip
    						]);
    						var updates = {};
    						updates['turn_end_key'] = [
    							newHistRef.key,
    							(are_we_client ? "client" : "host"),
    							"firing_response"
    						];
    						aiRef.update(updates);

                            // Calculate response using a probability density function. //
                            var final_guesses = probabilityDensityCalc(hit_map);

                            // Send response with a time delay.
                            setTimeout(function() {
                                // Transmit response.
                                var newHistRef = aiRef.child("/board_state/1/1").push();
                                newHistRef.set([
                                	(are_we_client ? "client" : "host"),
                                	final_guesses
                                ]);
                                var updates = {};
                                updates['turn_end_key'] = [
                                	newHistRef.key,
                                	(are_we_client ? "client" : "host"),
                                	"done_firing"
                                ];
                                aiRef.update(updates);
                            }, 4500);
    					} else if(turn_type === "firing_response"){
    						// Retrieve response for squares fired upon.
    						var fired_response = data.board_state[1][1][turn_key][1];

                            // Save fired squares to private store.
                            ai_store.dispatch({ type: "AI_UPDATE_OUR_FIRED_SQUARES", data: fired_response });

                            // Count our unique landed hits.
                            var uniqueHits = [];
                            for(let obj of fired_response){
                                if(obj.hasOwnProperty("ship")){
                                    uniqueHits.push(JSON.stringify(obj.square));
                                }
                            }
                            for(let obj of cur_state.our_fired){
                                if(obj.hasOwnProperty("ship")){
                                    uniqueHits.push(JSON.stringify(obj.square));
                                }
                            }

                            // Filter unique hits for duplicates.
                            uniqueHits = uniqueHits.filter(function(el, i, arr){
                                return arr.indexOf(el) === i;
                            });

                            // Continue after time delay.
                            setTimeout(function() {
                                // Check if game over.
                                var our_total_successful_hits = uniqueHits.length;
                                var winning_hit_num = all_ships.reduce(function(a, b){
                                    return a + b[1];
                                }, /*initialValue=*/0);
                                //console.log("Winning hit num", winning_hit_num);
                                if(our_total_successful_hits === winning_hit_num){
                                    console.log("AI wins.");
                                    var updates = {};
                                    updates["winner"] = (are_we_client ? "client" : "host")
                                    updates["winning_position"] = cur_state.hit_string;
                                    updates["broadcast_action"] = "game_over|" + (are_we_client ? "client" : "host");
                                    aiRef.update(updates);
                                    return;
                                }

                                // Wait for their attack.
                                console.log("AI: Waiting for opponent attack...");
                            }, 1000);
    					}
    				}
                }
            });
        };

        // Continue after click.
        var ai_user_info = [/*uid=*/0, "Battleboat Al", "/assets/img/ai.jpg"];
        $('#dialogModal').find('.btn').one("click", function() {
            setTimeout(function() {
                if(!already_hosting){
                    // Create a game.
                    var modes = ["regular", "salvo"];
                    var mode = modes[Math.floor(Math.random() * modes.length)]; // pick mode at random
                    var entry = {
            			users: [
            				ai_user_info
            			],
            			mode: mode,
            			user_states: ["SETUP_PENDING"],
            			board_state: [],
            			update_timestamp: Date.now(),
            			started: 0
            		};

            		// Generate database insertion query.
            		var newPostKey = firebase.database().ref().child('games').push().key;
            		entry["id"] = newPostKey;
            		var updates = {};
                    updates['/games/' + newPostKey] = entry;

                    // Insert the game entry.
                    firebase.database().ref().update(updates);

                    // Save state to store.
                    var new_state = {
        				"client": already_hosting,
        				"mode": entry.mode,
        				"board_state": entry.board_state
        			};

        			// Send new state to store.
        			ai_store.dispatch({type: "AI_UPDATE_GAME_STATE", data: new_state});

                    // Grab a game database reference.
                    aiRef = firebase.database().ref("games/" + newPostKey);

                    // Handle initial ACK ping-pong.
            		var hasStarted = 0;
            		var onGameDataChange = function(changed_data){
            			if(changed_data.getKey() !== "started") return; // don't waste bandwidth
                        var changed_val = changed_data.val();
                        if(changed_val == 1){
                            var updates = {};
                            updates['started'] = 2;
                            aiRef.update(updates);
                        } else if(changed_val == 3){
                            // Detach this callback and defer to main callback.
                            aiRef.off("child_added", onGameDataChange);
                            aiRef.off("child_changed", onGameDataChange);
                            aiRef.on("child_added", masterAiHandler);
                            aiRef.on("child_changed", masterAiHandler);

                            // Inform opponent we are starting setup.
                            var updates = {};
                            updates["user_states/0"] = "DOING_SETUP";
                            aiRef.update(updates);
                        }
                    };
                    aiRef.on("child_added", onGameDataChange);
            		aiRef.on("child_changed", onGameDataChange);
                } else {
                    // Grab a game database reference.
                    aiRef = firebase.database().ref("/games/" + data.id);

                    // Update database entry object.
                    var base_url = "/games/" + data.id + "/";
                    var updates = {};
                    updates["/started"] = 1;
                    updates["/users/1"] = ai_user_info;
                    updates["/user_states/1"] = "SETUP_PENDING";
                    updates["/update_timestamp"] = Date.now();
                    updates["/board_state"] = [];
                    aiRef.update(updates);

                    // Save state to store.
                    aiRef.once("value", function(value) {
                        var new_state = {
            				"client": already_hosting,
            				"mode": value.mode,
            				"board_state": value.board_state
            			};

            			// Send new state to store.
            			ai_store.dispatch({type: "AI_UPDATE_GAME_STATE", data: new_state});
                    });

                    // Handle ACK ping-pong.
                    var onGameDataChange = function(changed_data){
                        if(changed_data.getKey() !== "started") return;
                        var changed_val = changed_data.val();
                        if(changed_val == 2){
                            // Detach this callback and defer to main callback.
                            aiRef.off("child_added", onGameDataChange);
                            aiRef.off("child_changed", onGameDataChange);
                            aiRef.on("child_added", masterAiHandler);
                            aiRef.on("child_changed", masterAiHandler);

                            // Send a reply ACK.
                            var updates = {};
                            updates["/started"] = 3;
                            updates["/user_states/1"] = "DOING_SETUP";
                            updates["/board_state"] = [
                                ["ht", ["", ""]], // for hit testing
                                ["his", [[0]]] // for history
                            ];
                            updates["/broadcast_action"] = "setup";
                            aiRef.update(updates);
                        }
                    }
                    aiRef.on("child_added", onGameDataChange);
                    aiRef.on("child_changed", onGameDataChange);
                }
            }, 10);
        });
    };

	// Generate helper function for hit-testing grid squares. //
	var gridIndexForElem = undefined;
	setTimeout(function() {
		var top_left = $('.grid-first-col.grid-first-row').offset();
		top_left = [top_left.left, top_left.top]; // [x, y]
		console.log(top_left);
		var square_height = $('.grid-first-col')[0].offsetHeight;
		var square_width = $('.grid-first-col')[0].offsetWidth;
		function getCoords(elem) { // crossbrowser version
			// From http://stackoverflow.com/questions/5598743/finding-elements-position-relative-to-the-document
		    var box = elem.getBoundingClientRect();

		    var body = document.body;
		    var docEl = document.documentElement;

		    var scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop;
		    var scrollLeft = window.pageXOffset || docEl.scrollLeft || body.scrollLeft;

		    var clientTop = docEl.clientTop || body.clientTop || 0;
		    var clientLeft = docEl.clientLeft || body.clientLeft || 0;

		    var top  = box.top +  scrollTop - clientTop;
		    var left = box.left + scrollLeft - clientLeft;

		    return { top: Math.round(top), left: Math.round(left) };
		}
		gridIndexForElem = function(el){
			// [top, right, bottom, left, width, height]
			var rect = el.getBoundingClientRect(), coords = getCoords(el);
			//console.log(rect, coords);
			var x = coords.left, y = coords.top;
			var width = rect.width, height = rect.height;
			var dx = x - top_left[0], dy = y - top_left[1];
			//console.log(x, y, square_width, square_height);
			var col = Math.round(dx / square_width);
			var row = Math.round(dy / square_height);
			var spreadX = Math.round(width / square_width);
			var spreadY = Math.round(height / square_height);
			var res = [];
			for(var i = 0; i < spreadX; i++){
				for(var j = 0; j < spreadY; j++){
					var r = row + j, c = col + i;
					if(r < 0 || r > 9 || c < 0 || c > 9) continue;
					res.push([r, c]);
				}
			}
            console.log($(el).data("type"), res);
			return res;
		};
	}, 150);

	// Define some interface helper functions. //
	// Define ship creation helper function.
	var shipNum = 0, shipPositions = {};
	var createShip = function(length, type){
		// Create element.
		++shipNum;
		var top_left = $('.grid-first-col.grid-first-row').offset();
		top_left = [top_left.left, top_left.top]; // [x, y]
		var elem = $('<div class="draggable-ship" id="shipnum' + shipNum.toString() + '"></div>');
		var square_height = $('.grid-first-col')[0].offsetHeight;
		var div_height = square_height;
		var square_width = $('.grid-first-col')[0].offsetWidth;
		var div_width = square_width * length;
		elem.data("length", length);
		elem.data("type", type);
		var pos_array = [
			null,
			[0, 0],
			[2, 3],
			[4, 2],
			[6, 3],
			[8, 7]
		]
		var random_pos = $('#grid-' + pos_array[shipNum][0].toString() + "-" + pos_array[shipNum][1].toString()).offset();
		elem.css({
			position: "absolute",
			top: random_pos.top.toString() + "px",
			left: random_pos.left.toString() + "px",
			height: div_height.toString() + "px",
			width: div_width.toString() + "px",
			"z-index": shipNum // to prevent ships from pushing each other around
		})
		$("#game-grid-container").append(elem);
		var top_left = $('.grid-top-left').position();

		// Set up interact.js to allow dragging and snapping to corners.
		(function() {
			var el = document.getElementById('shipnum' + shipNum.toString());
			var x = 0, y = 0;
            var currently_rotated = false;
			var updateCovered = function() {
				// Generate ship class.
				var jEl = $(el);
				var ship_type = jEl.data("type");
				var ship_class = "ship-class-" + ship_type;
				var general_ship_conflict_class = "ship-conflict-general";
				var ship_conflict_class = "ship-conflict-class-" + ship_type;

				// Remove previous hover effects.
				$('.ship-occupying.' + ship_class + ":not(." + general_ship_conflict_class + ")")
					.removeClass('ship-drag-hover')
					.removeClass('ship-drag-hover-invalid')
					.removeClass("ship-occupying")
					.removeClass(ship_class)
				;
				$('.' + ship_conflict_class)
					.addClass("ship-drag-hover")
					.removeClass("ship-drag-hover-invalid")
					.removeClass(ship_conflict_class)
					.removeClass(general_ship_conflict_class)
				; // reset conflicts

				// Generate list of grid squares covered and applicable effects.
				var grid_covered = gridIndexForElem(el);
				shipPositions[ship_type] = grid_covered;
				var class_adding = (grid_covered.length == jEl.data("length") ? "ship-drag-hover" : "ship-drag-hover-invalid");
				//console.log(grid_covered);
				for(var i = 0; i < grid_covered.length; i++){
					var on = grid_covered[i];
					var elem_id = "grid-" + on[0].toString() + "-" + on[1].toString();
					var grid_elem = $('#' + elem_id);
					if(grid_elem.hasClass("ship-occupying")){
						grid_elem
							.removeClass("ship-drag-hover")
							.addClass("ship-drag-hover-invalid")
							.addClass(ship_conflict_class)
							.addClass(general_ship_conflict_class);
					} else {
						grid_elem.addClass(class_adding).addClass(ship_class).addClass("ship-occupying");
					}
				}

				// Make ship visible if not covering anything yet.
				if(grid_covered.length == 0){
					jEl.animate({
						opacity: 1.0
					}, 2500);
				} else {
					jEl.stop(true, true);
					jEl.css("opacity", 0.05);
				}
			}
			interact(el)
				.draggable({
					snap: {
						targets: [
							interact.createSnapGrid({
								x: square_width,
								y: square_height,
								offset: {
									x: top_left.left,
									y: top_left.top
								}
							})
						],
						range: Infinity,
						relativePoints: [ { x: 0, y: 0 } ]
					},
					inertia: false,
					restrict: {
						restriction: "parent",
						elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
				    }
				})
				.on('dragmove', function (event) {
					// Update element position.
					x += event.dx;
					y += event.dy;

					// Update element transform style.
					event.target.style.webkitTransform = event.target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';

					// Update covered squares.
					updateCovered();
				})
				.on("tap", function(event) {
					// Retrieve current dimensions.
					var origHeight = event.target.style.height;
					var origWidth = event.target.style.width;

                    // Set new dimensions.
                    if(currently_rotated){
                        event.target.style.height = div_height.toString() + "px";
    					event.target.style.width = div_width.toString() + "px";
                    } else {
                        event.target.style.height = (square_height * length).toString() + "px";
    					event.target.style.width = square_width.toString() + "px";
                    }

                    // Update rotated flag.
                    currently_rotated = !currently_rotated;

					// Update covered squares.
					updateCovered();
				});

			// Initial covered update.
			updateCovered();
		})();
	}
	// Define ship setup helper function.
	var generateHitString = function(smap){
		return lzw_encode(JSON.stringify(smap));
	}
	var parseHitString = function(hit_str){
		return JSON.parse(lzw_decode(hit_str));
	}
	var startInterfaceSetup = function(){
		// Mark setup as in progress.
		setup_complete = false;
		$('.grid-square').each(function() {
			$(this).addClass("waiting-for-setup");
		});

		// Create necessary ships.
		for(var i = 0; i < all_ships.length; i++){
			// Create the ship.
			var on = all_ships[i];
			createShip(on[1], on[0]);
		}

		// Display instructions.
		$('#dialogModal').find('.dialog-modal-header').text("Set Up Instructions");
		$('#dialogModal').find('.dialog-modal-subheader').text("Drag ships where desired and click 'Finish setup' when done. Click once on a ship to rotate it.");
		$('#dialogModal').fadeIn();

		// Configure button for finishing setup. //
		var lengthForShipType = {};
		all_ships.map(function(val) {
			lengthForShipType[val[0].toLowerCase()] = val[1];
		});
		$('.finish-setup-button').off("click"); // unbind any previous handlers
		$('.finish-setup-button').click(function() {
			// Validate ship positions.
			var passed = true;
			var already_seen = [];
			for(var type in shipPositions){
				var on = shipPositions[type];
				var len = lengthForShipType[type.toLowerCase()];
				if(on.length != len){
					passed = false;
					break;
				}
				on.map(function(arr){
					// [row, col]
					var pos_str = arr[0].toString() + "-" + arr[1].toString();
					if(already_seen.indexOf(pos_str) !== -1){
						passed = false;
					}
					already_seen.push(pos_str);
				});
				if(!passed) break;
			}

			// Handle error, if applicable.
			if(!passed){
				$('#dialogModal').find('.dialog-modal-header').text("Invalid Ship Positions");
				$('#dialogModal').find('.dialog-modal-subheader').text("One or more of your ships are either out of bounds or intersecting each other. Problematic areas should be highlighted in red.");
				$('#dialogModal').fadeIn();
				return;
			}

			// Hide this button.
			$('.finish-setup-button').fadeOut();

			// Display loading screen while updating database and waiting for
			// opponent.
			$('#progressModal').find('.progress-modal-header').text("Waiting for opponent...")
			$('#progressModal').find('.progress-modal-code').hide();
			$('#progressModal').find('.progress-modal-subheader').hide();
			$('#progressModal').fadeIn();

			// Save hit string and update user state.
			var updates = {};
			var cur_state = store.getState();
			var are_we_client = cur_state.game_state.client;
			var user_num = (are_we_client ? "1" : "0");
			var user_int = parseInt(user_num);
			var hit_str = generateHitString(shipPositions);
			updates['board_state/0/1/' + user_num] = "no_hit_str"; // keep hit string private for security purposes
			updates['user_states/' + user_num] = "SETUP_COMPLETE";
			updates['broadcast_action'] = "setup_ended_" + (are_we_client ? "client" : "host");
			gameRef.update(updates);

			// Store hit string in private store.
			store.dispatch({ type: "SET_HIT_STRING", data: hit_str });
		});
		$('.finish-setup-button').fadeIn();
	}
    var startTurnPrompt = function() {
        $('#dialogModal').find('.dialog-modal-header').text("Your Turn");
        $('#dialogModal').find('.dialog-modal-subheader').text("It is now your turn to fire at your opponent. Choose wisely!");
        $('#dialogModal').fadeIn();
    }
    var addHistorySquares = function() {
        // Figure out which ships we have destroyed.
        var cur_state = store.getState();
        var our_fired = cur_state.our_fired;
        console.log("Our fired", our_fired);
        var hitsByShip = {};
        for(var i = 0; i < our_fired.length; i++){
            var on = our_fired[i];
            if(!on.ship) continue;
            var ship = on.ship.toLowerCase();
            if(!(ship in hitsByShip)){
                hitsByShip[ship] = 1;
            } else {
                ++hitsByShip[ship];
            }
        }
        var destroyed_ships = all_ships
            .map(function(val){
                var landed = hitsByShip[val[0].toLowerCase()];
                if(landed === val[1]){
                    return val[0].toLowerCase();
                } else {
                    return null;
                }
            })
            .filter(function(val) {
                return val !== null;
            })
        ;

        // Fill in board for our hits and misses.
        for(var i = 0; i < our_fired.length; i++){
            var on = our_fired[i];
            var on_sq = on.square;
            //console.log("History add", on);
            var grid_id = 'grid-' + on_sq[0].toString() + '-' + on_sq[1].toString();
            $('#' + grid_id).addClass("grid-history-active");
            if(on.ship){
                var ship = on.ship.toLowerCase();
                if(destroyed_ships.indexOf(ship) !== -1){
                    $('#' + grid_id).addClass("grid-history-destroyed-ship");
                }
            }
            if(on.hit){
                $('#' + grid_id).addClass("grid-history-hit");
            } else {
                $('#' + grid_id).addClass("grid-history-miss");
            }
        }
    }
    var enableGridHover = function() {
        // Enable hover and click effects.
        setup_complete = true;
        $('.grid-square').each(function() {
			$(this).removeClass("waiting-for-setup");
		});

        // Add history to interface.
        addHistorySquares();
    }
    var disableGridHover = function() {
        setup_complete = false;
        $('.grid-missile-fired').each(function() {
            var that = $(this);
            that.removeClass("grid-missile-fired");
            that.css("animation", "none");
            setTimeout(function() {
                that.css("animation", "");
            }, 150);
        });
        $('.grid-history-active').removeClassPrefix("grid-history");
        $('.grid-square').each(function() {
			$(this).addClass("waiting-for-setup");
		});
    }
	var startGame = function(){
		// Hide other modals.
		$('#progressModal').fadeOut();
		$('.draggable-ship').fadeOut();
		$('.ship-occupying').removeClassPrefix("ship-");

        // Display ship sidebar.
        $('#ship_area').show();

		// Wait for opponent if we are client.
		var cur_state = store.getState().game_state;
		var are_we_client = cur_state.client;
		if(are_we_client){
			// Wait for opponent to reply with hit test.
			$('#progressModal').find('.progress-modal-header').text("Waiting for opponent's attack...")
			$('#progressModal').find('.progress-modal-code').hide();
			$('#progressModal').find('.progress-modal-subheader').hide();
			$('#progressModal').fadeIn();

            // Initialize interface.
            disableGridHover();
		} else {
            // Initialize interface.
            enableGridHover();
        }

		// Set up fire button.
		$('.end-turn-button').click(function() {
			// Get current game state and mode.
			var cur_state = store.getState().game_state;
			var mode = cur_state.mode;

			// Verify number of missiles fired as legal based on game mode.
			var fired = $('.grid-missile-fired');
			var missiles_fired = fired.length;
			var error = undefined;
			if(missiles_fired === 0){
				error = "Must fire at least one missile per turn.";
			} else if(mode === "regular" && missiles_fired !== 1){
				error = "Can only fire one missile per turn in classic Battleship.";
			} else if(mode === "salvo"){
                // Retrieve our current hit state.
                var overall_state = store.getState();
                var hit_map = parseHitString(overall_state.hit_string);

                // Retrieve their hit squares.
                var their_fired = overall_state.their_fired.map(function(val) {
                    return JSON.stringify(val.square);
                });

                // Count extant ships.
                var extant_ships = 0;
                for(var ship_name in hit_map){
                    var on_arr = hit_map[ship_name];
                    for(var i = 0; i < on_arr.length; i++){
                        var on = on_arr[i];
                        if(their_fired.indexOf(JSON.stringify(on)) === -1){
                            // We still have at least one square of the ship alive.
                            ++extant_ships;
                            break;
                        }
                    }
                }
                //console.log("extant ships", extant_ships);

                // Verify number of missiles.
                if(missiles_fired > extant_ships){
                    error = "In salvo mode, you can only fire as many missiles as you have ships remaining.";
                }
            }

			// Handle error, if applicable.
			if(error !== undefined){
				$('#dialogModal').find('.dialog-modal-header').text("Illegal Firing Pattern");
				$('#dialogModal').find('.dialog-modal-subheader').text(error);
				$('#dialogModal').fadeIn();
				return;
			}

			// Update interface.
            disableGridHover();
			$(this).fadeOut();

			// Accumulate fired points.
			var points = [];
			fired.each(function() {
				points.push([parseInt($(this).data("row")), parseInt($(this).data("col"))]);
			})

			// Send database update.
			var newHistRef = gameRef.child("board_state/1/1").push();
			newHistRef.set([
				(are_we_client ? "client" : "host"),
				points
			]);
			var updates = {};
			updates['turn_end_key'] = [
				newHistRef.key,
				(are_we_client ? "client" : "host"),
				"done_firing"
			];
			gameRef.update(updates);

			// Wait for opponent to reply with hit test.
			$('#progressModal').find('.progress-modal-header').text("Waiting for result...")
			$('#progressModal').find('.progress-modal-code').hide();
			$('#progressModal').find('.progress-modal-subheader').hide();
			$('#progressModal').fadeIn();
		});
		if(!are_we_client){
			$('.end-turn-button').fadeIn();
		}

		// Display instructions.
        var instructions = "(unknown mode)", mode = store.getState().game_state.mode;
        instructions = "Click once on a square to mark it as a guess, and again to clear it. Once you have made your decision, click 'Fire' to dispatch your missile";
        if(mode === "regular"){
            instructions += ". You have one missile per turn in classic mode.";
        } else if(mode === "salvo"){
            instructions += "s. You have one missile per surviving ship in salvo mode.";
        }
		$('#dialogModal').find('.dialog-modal-header').text("Gameplay Instructions");
		$('#dialogModal').find('.dialog-modal-subheader').text(instructions);
		$('#dialogModal').fadeIn();
	}

	// Define main game event handler.
	var masterGameHandler = function(changed_data){
		// Check if the event is interesting (e.g. worth a database fetch).
		var key = changed_data.getKey();
		if(interesting_keys.indexOf(key) === -1) return;
		console.log(key);

		// Handle special keys.
		var setup_check = false;
        var have_we_lost = false;
		if(key === "broadcast_action"){
			var action = changed_data.val();
			if(action === "setup"){
				// Start interface setup.
				startInterfaceSetup();

				// Allow current game state to be saved. -
			} else if(action.indexOf("setup_ended") === 0){
				// SETUP_COMPLETE state will be stored in redux for
				// the appropriate user.
				setup_check = true;
				console.log(changed_data);
				console.log("Game state", store.getState().game_state);

				// Allow current game state to be saved. -
			} else if(action.indexOf("game_over") === 0){
                var cur_state = store.getState();
    			var are_we_client = cur_state.game_state.client;
                var winner = action.split("|")[1];
                var us_str = (are_we_client ? "client" : "host");
                if(winner !== us_str){
                    have_we_lost = true;
                }
            }
		}

		// Grab current game state from database.
		gameRef.once("value", function(data) {
			// Get current game state.
			var cur_state = store.getState();
			var game_state = cur_state.game_state;
			var are_we_client = cur_state.game_state.client;

			// Retrieve value from reference.
			data = data.val();
			console.log("Master game handler", data);

			// Update store as necessary.
			var new_state = {
				"client": game_state.client,
				"mode": game_state.mode,
				"entry_key": game_state.entry_key,
				"board_state": data.board_state,
				"user_states": data.user_states,
				"update_timestamp": data.update_timestamp,
				"started": data.started
			};

			// Send new state to store.
			store.dispatch({type: "UPDATE_GAME_STATE", data: new_state});

			// Perform a setup check if needed.
			if(setup_check){
				if(data.user_states[0] === data.user_states[1] && data.user_states[1] === "SETUP_COMPLETE"){
					// Start game.
					setTimeout(function() {
						startGame();
					}, 150);
				}
			}

            // Check if we have lost, and handle accordingly.
            if(have_we_lost){
                // Reveal where the opponent's ships were.
                $('.grid-animating').removeClassPrefix("grid-animat");
                disableGridHover();
                addHistorySquares();
                var hit_map = parseHitString(data.winning_position);
                for(var ship_name in hit_map){
                    var on_arr = hit_map[ship_name];
                    for(var i = 0; i < on_arr.length; i++){
                        var on_sq = on_arr[i];
                        var grid_id = 'grid-' + on_sq[0].toString() + '-' + on_sq[1].toString();
                        $('#' + grid_id).addClass("grid-animation-ship-residing");
                    }
                }

                // Display result modal.
                $('#gameResultModal').find('.game-result-modal-header').text("You Lose.");
                $('#gameResultModal').find('.game-result-modal-subheader').text("Your opponent won - their ship arrangement is being displayed. Avenge yourself!");
                $('#gameResultModal').fadeIn();
                var name = cur_state.user_info.displayName.split(" ")[0];
                addStatusEntry("Unfortunately, " + name + ", you lost. Don't let them get the last laugh!");
                return;
            }

			// Handle turn types.
			if(key === "turn_end_key"){
				var turn_data = changed_data.val();
				var turn_key = turn_data[0];
				var whose_turn = turn_data[1], turn_type = turn_data[2];
				var our_turn = (are_we_client ? "client" : "host");
				if(whose_turn !== our_turn){ // don't respond to our own events
					if(turn_type === "done_firing"){
                        // Dismiss dialog modal if not a turn prompt.
                        if($('#dialogModal').find('.dialog-modal-header').text() !== "Your Turn"){
                            $('#dialogModal').find('.btn').click();
                        }

						// Retrieve our current hit state.
						var hit_map = parseHitString(cur_state.hit_string);

						// Retrieve the squares they fired on.
						var fired_squares = data.board_state[1][1][turn_key][1];
						console.log("Other played fired", fired_squares);

						// Count how many squares were hit, and belonging to
						// which ship.
						var hitMissShip = [];
						for(var i = 0; i < fired_squares.length; i++){
							var on = JSON.stringify(fired_squares[i]);
							var ship_hit = undefined, square_hit = false;
							for(var ship_name in hit_map){
								var hit = (hit_map[ship_name].map(function(val) {
									return JSON.stringify(val);
								}).indexOf(on)) !== -1;
								if(hit){
									ship_hit = ship_name;
									square_hit = true;
									break;
								}
							}
                            var pushing = {
								square: fired_squares[i],
								hit: square_hit
							};
                            if(square_hit){
                                pushing["ship"] = ship_hit;
                            }
							hitMissShip.push(pushing);
						}

                        // Save fired squares to private store.
                        store.dispatch({ type: "UPDATE_THEIR_FIRED_SQUARES", data: hitMissShip });

						// Transmit which squares were hit.
						var newHistRef = gameRef.child("board_state/1/1").push();
						newHistRef.set([
							(+ are_we_client), // cast bool to int
							hitMissShip
						]);
						var updates = {};
						updates['turn_end_key'] = [
							newHistRef.key,
							(are_we_client ? "client" : "host"),
							"firing_response"
						];
						gameRef.update(updates);

                        // Update ship sidebar.
                        $('.health-red').removeClass("health-red");
                        var their_fired_json = store.getState().their_fired.map(function(val) {
                            return JSON.stringify(val.square);
                        });
                        for(var ship_name in hit_map){
                            // Count squares hit for this ship.
                            var on_arr = hit_map[ship_name];
                            var hit_squares = 0;
                            for(var i = 0; i < on_arr.length; i++){
                                var on = on_arr[i];
                                if(their_fired_json.indexOf(JSON.stringify(on)) !== -1){
                                    // This ship square has been fired upon.
                                    ++hit_squares;
                                }
                            }

                            // Update health of ship accordingly.
                            var ship_health = $('.ship-health-' + ship_name.toLowerCase());
                            for(var i = 0; i < hit_squares; i++){
                                ship_health.find(':nth-child(' + (i + 1).toString() + ')').addClass("health-red");
                            }
                        }

						// Ready interface for firing animation.
						$('#progressModal').fadeOut();

                        // Do interface changes in background thread.
                        setTimeout(function() {
                            // Retrieve updated game state.
                            cur_state = store.getState();

    						// Display firing animation. //
                            // First, special styling for squares just hit or missed w/ animation.
                            var total_hits = hitMissShip.length;
                            var successful_hits = 0;
                            for(var i = 0; i < hitMissShip.length; i++){
                                var on = hitMissShip[i];
                                var on_sq = on.square;
                                var grid_id = 'grid-' + on_sq[0].toString() + '-' + on_sq[1].toString();
                                $('#' + grid_id).addClass("grid-animating");
                                if(on.hit){
                                    ++successful_hits;
                                    $('#' + grid_id).addClass("grid-animation-firing-hit");
                                } else {
                                    $('#' + grid_id).addClass("grid-animation-firing-miss");
                                }
                            }

                            // Second, display their hit/missed squares from the past.
                            var their_fired = cur_state.their_fired;
                            for(var i = 0; i < their_fired.length; i++){
                                // square, hit, ship
                                var on = their_fired[i];
                                var on_sq = on.square;
                                var grid_id = 'grid-' + on_sq[0].toString() + '-' + on_sq[1].toString();
                                $('#' + grid_id).addClass("grid-animating");
                                if(on.hit){
                                    $('#' + grid_id).addClass("grid-animation-ship-hit");
                                } else {
                                    $('#' + grid_id).addClass("grid-animation-ship-miss");
                                }
                            }

                            // Third, indicate which spots our ships are residing on.
                            for(var ship_name in hit_map){
                                var arr_on = hit_map[ship_name];
                                for(var i = 0; i < arr_on.length; i++){
                                    var on_sq = arr_on[i];
                                    var grid_id = 'grid-' + on_sq[0].toString() + '-' + on_sq[1].toString();
                                    if(!$('#' + grid_id).hasClass("grid-animating")){
                                        $('#' + grid_id)
                                            .addClass("grid-animating")
                                            .addClass("grid-animation-ship-residing")
                                        ;
                                    }
                                }
							}

                            // Finally, update sidebar with our ships + health.
                            // TODO

                            setTimeout(function() {
                                // Display result in terms of made / total in text modal.
                                $('#dialogModal').find('.dialog-modal-header').text("Turn Result");
                                var message = "They landed ";
                                if(successful_hits == 0) message += "no hits";
                                else if(successful_hits == 1) message += "1 hit";
                                else message += successful_hits.toString() + " hits";
                                message += " out of " + total_hits.toString() + ".";
                                addStatusEntry(message);
                        		$('#dialogModal').find('.dialog-modal-subheader').text(message);
                        		$('#dialogModal').fadeIn();

                                // Continue after click.
                                $('#dialogModal').find('.btn').one("click", function() {
                                    // Update interface for next turn.
                                    $('.grid-animating').removeClassPrefix("grid-animat");
                                    enableGridHover();
            						$('.end-turn-button').fadeIn();
                                    startTurnPrompt();
                                });
                            }, 3000);
                        }, 250);
					} else if(turn_type === "firing_response"){
						// Retrieve response for squares fired upon.
						var fired_response = data.board_state[1][1][turn_key][1];
						console.log("Firing response", fired_response);

                        // Save fired squares to private store.
                        store.dispatch({ type: "UPDATE_OUR_FIRED_SQUARES", data: fired_response });

						// Fade out progress modal.
						$('#progressModal').fadeOut();

                        // First, special styling for squares just hit or missed w/ animation.
                        var total_hits = fired_response.length;
                        var successful_hits = 0;
                        var uniqueHits = [];
                        for(var i = 0; i < fired_response.length; i++){
                            var on = fired_response[i];
                            var on_sq = on.square;
                            var grid_id = 'grid-' + on_sq[0].toString() + '-' + on_sq[1].toString();
                            $('#' + grid_id).addClass("grid-animating");
                            if(on.hit){
                                ++successful_hits;
                                $('#' + grid_id).addClass("grid-animation-firing-hit");
                                uniqueHits.push(JSON.stringify(on_sq));
                            } else {
                                $('#' + grid_id).addClass("grid-animation-firing-miss-bad");
                            }
                        }

                        // Next, display our hit/missed squares from the past.
                        var our_fired = cur_state.our_fired;
                        for(var i = 0; i < our_fired.length; i++){
                            // square, hit, ship
                            var on = our_fired[i];
                            var on_sq = on.square;
                            var grid_id = 'grid-' + on_sq[0].toString() + '-' + on_sq[1].toString();
                            $('#' + grid_id).addClass("grid-animating");
                            if(on.hit){
                                $('#' + grid_id).addClass("grid-animation-ship-hit");
                                uniqueHits.push(JSON.stringify(on_sq));
                            } else {
                                $('#' + grid_id).addClass("grid-animation-ship-miss");
                            }
                        }

                        setTimeout(function() {
                            // Check if game over.
                            // TODO: Pass our hit string to reveal ship locations to them
                            uniqueHits = uniqueHits.filter(function(el, i, arr){
                                return arr.indexOf(el) === i;
                            });
                            var our_total_successful_hits = uniqueHits.length;
                            var winning_hit_num = all_ships.reduce(function(a, b){
                                return a + b[1];
                            }, /*initialValue=*/0);
                            //console.log("Winning hit num", winning_hit_num);
                            if(our_total_successful_hits === winning_hit_num){
                                $('#gameResultModal').find('.game-result-modal-header').text("You Win!");
                                $('#gameResultModal').find('.game-result-modal-subheader').text("Congratulations, you won!");
                                $('#gameResultModal').fadeIn();
                                var name = cur_state.user_info.displayName.split(" ")[0];
                                addStatusEntry("Congratulations " + name + ", you won!");
                                var updates = {};
                                updates["winner"] = (are_we_client ? "client" : "host")
                                updates["winning_position"] = cur_state.hit_string;
                                updates["broadcast_action"] = "game_over|" + (are_we_client ? "client" : "host");
                                gameRef.update(updates);
                                return;
                            }

                            // Display result in terms of made / total in text modal.
                            $('#dialogModal').find('.dialog-modal-header').text("Turn Result");
                            var message = "You landed ";
                            if(successful_hits == 0) message += "no hits";
                            else if(successful_hits == 1) message += "1 hit";
                            else message += successful_hits.toString() + " hits";
                            message += " out of " + total_hits.toString() + ".";
                            addStatusEntry(message);
                            $('#dialogModal').find('.dialog-modal-subheader').text(message);
                            $('#dialogModal').fadeIn();

                            // Continue after click.
                            $('#dialogModal').find('.btn').one("click", function() {
                                // Update interface for next turn.
                                $('.grid-animating').removeClassPrefix("grid-animat");

                                // Wait for opponent's attack.
                    			$('#progressModal').find('.progress-modal-header').text("Waiting for opponent's attack...")
                    			$('#progressModal').find('.progress-modal-code').hide();
                    			$('#progressModal').find('.progress-modal-subheader').hide();
                    			$('#progressModal').fadeIn();
                            });
                        }, 2000);
					}
				} else {
					if(turn_type === "done_firing"){
						// Hide firing button.
						$('.end-turn-button').fadeOut();
					}
				}
			}
		});
	};

	// Grab a database reference.
	var db = firebase.database();

	// Set up the status area. //
	// Set up the container.
	var status_container = $('<div class="status-container"></div>');

	// Set up the scrolling container.
	var pad = function(n, width, z) {
		z = z || '0';
		n = n + '';
		return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
	}
	var addStatusEntry = function(entry){
		var d = new Date();
		var text = "" + pad(d.getHours(), 2) + ":" + pad(d.getMinutes(), 2) + ":" + pad(d.getSeconds(), 2) + " - " + entry;
		$('<div class="status-row"><h5>' + text + '</h5></div>').appendTo(scroll_container);
		$(".status-scroll-container").first().animate({ scrollTop: $(".status-scroll-container").prop("scrollHeight")}, 1000);
	}
	var scroll_container = $('<div class="status-scroll-container"></div>');

	// Install scroll container.
	scroll_container.appendTo(status_container);

	// Install status container.
	status_container.appendTo($('#status_area'));

	// Set up the account area. //
	// Set up the container.
	var status_container = $('<div class="account-container"></div>');

	// Add necessary elements to container.
	status_container.append($('<div class="media account-info-box"> \
		<div class="media-left"> \
			<img class="media-object image-resize-to-fit img-circle" src="" alt="Account photo"></img> \
		</div> \
		<div class="media-body"> \
			<h4 class="media-heading cyan-blue">Media heading</h4> \
			<button type="button" class="btn btn-primary btn-rounded btn-sm sign-out-btn">Sign Out</button> \
		</div> \
	</div>'));

	// Install account container.
	status_container.appendTo($('#account_area'));

    // Set up the ships area. //
	// Set up the container.
	var ship_container = $('<div class="ship-container"></div>');

	// Add ships to container.
    var ship_div = $('<div></div>');
    var prettyShipNames = [
        "Aircraft Carrier",
        "Battleship",
        "Cruiser",
        "Submarine",
        "Destroyer"
    ];
    for(var i = 0; i < all_ships.length; i++){
        var on = all_ships[i]; // [name, length]
        var name = on[0].toLowerCase();
        var svg_src = "/assets/svg/ships/" + name + ".svg";
        var cur_ship = $('<div> \
            <object class="ship-sidebar-img" data="' + svg_src + '" type="image/svg+xml" alt="Ship image"> \
            </object> \
            <div class="text-center"> \
                <p class="ship-name">' + prettyShipNames[i] + '&nbsp;</p> \
                <p class="ship-health"></p> \
            </div> \
        </div>');
        cur_ship.find('.ship-health').addClass("ship-health-" + name);
        cur_ship.find('.ship-health').append('[');
        for(var j = 0; j < on[1]; j++){
            cur_ship.find('.ship-health').append($('<i class="fa fa-square health-square" aria-hidden="true"></i>'))
        }
        cur_ship.find('.ship-health').append(']');
        cur_ship.appendTo(ship_div);
    }

    // Install ship div.
    ship_div.appendTo(ship_container);

	// Install account container.
	ship_container.appendTo($('#ship_area'));

	// Set up the user areas. //
	// Hide versus text.
	$('#versusText').hide();

	// Set up the two user areas on either side.
	for(var i = 1; i <= 2; i++){
		var container = $('#user_area' + i.toString());
		container.append($('<div class="media user-info-box"> \
			<div class="media-left"> \
				<img class="media-object image-resize-to-fit img-circle" src="" alt="Account photo"></img> \
			</div> \
			<div class="media-body"> \
				<h4 class="media-heading cyan-blue">User Name</h4> \
				<p class="media-text"></p> \
			</div> \
		</div>'));
	}
	$('.user-info-box').find('.media-text').text("Client/host");
	$('.user-info-box').hide();

	// Set up helper functions to update user areas.
	var updateUserAreas = function(users){
		// uid, name, photoURL
		// Figure out which is us and which is them.
		var cur_state = store.getState();
		var our_uid = cur_state.user_info.uid;
		var are_we_client = cur_state.game_state.client;
		var us = users.filter(function(a){ return a[0] == our_uid; })[0];
		var them = users.filter(function(a){ return a[0] != our_uid; })[0];

		// Update interface accoridngly.
		var client_text = [
			"Host",
			"Client"
		];
		$('.user-area-right').find('.media-heading').text(them[1]);
		$('.user-area-right').find('.media-text').text(client_text[+ !are_we_client]); // unary + operator casts bool to int
		$('.user-area-right').find('.media-object').attr('src', them[2]);
		$('.user-area-left').find('.media-heading').text("You");
		$('.user-area-left').find('.media-text').text(client_text[+ are_we_client]);
		$('.user-area-left').find('.media-object').attr('src', us[2]);

		// Display interface changes.
		//$('#versusText').fadeIn();
		$('.user-info-box').fadeIn();
	}

	// Set up the 10x10 game grid. //
	// Set up the container.
	var game_container = $('<div class="fluid-container grid-container" id="game-grid-container"></div>');

	// Set up the header.
	var header = $('<div class="row grid-header"></div>');
	for(var j = 0; j < 11; j++){
		var number = (j == 0 ? "" : (j).toString());
		var elem = $('<div class="col-md-1 col-xs-1 grid-top-label"><h2>' + number + '</div>');
		elem.appendTo(header);
	}
	header.appendTo(game_container);

	// Set up the grid.
	var svg_missile_hover = "";
	var svg_missile_fired = "";

	for(var i = 0; i < 10; i++){
		var row = $('<div class="row grid-row"></div>');
		var row_letter = String.fromCharCode(65 + i);
		row.append($('<div class="col-md-1 col-xs-1 grid-label"><h2>' + row_letter + '</h2></div>'));
		for(var j = 0; j < 10; j++){
			var elem_id = "grid-" + i.toString() + "-" + j.toString();
			var elem = $('<div id="' + elem_id + '" class="col-md-1 col-xs-1 grid-square">' + svg_missile_hover + svg_missile_fired + '</div>');
			elem.data("row", i);
			elem.data("col", j);
			if(j == 0) elem.addClass("grid-first-col");
			else if(j == 9) elem.addClass("grid-last-col");
			if(i == 0){
				elem.addClass("grid-first-row");
				if(j == 0) elem.addClass("grid-top-left");
				else if(j == 9) elem.addClass("grid-top-right");
			}
			if(i == 9){
				elem.addClass("grid-last-row");
				if(j == 0) elem.addClass("grid-bottom-left");
				else if(j == 9) elem.addClass("grid-bottom-right");
			}
			elem.appendTo(row);
		}
		row.append($('<div class="col-md-1 col-xs-1 grid-spacer"></div>'));
		row.appendTo(game_container);
	}

	// Install the container.
	game_container.appendTo($('#game_area'));

	// Install hover handlers for grid squares.
	/*
	$('.grid-square').hover(function() {
		if(!setup_complete) return;
		if($(this).hasClass("grid-missile-fired")) return;
		$(this).find(".missile_hover").show();
	}, function() {
		$(this).find(".missile_hover").hide();
	});
	*/

	// Disable hover effects until game is setup.
	$('.grid-square').each(function() {
		$(this).addClass("waiting-for-setup");
	});

	// Install click handler for grid squares.
	$('.grid-square').click(function() {
		if(!setup_complete) return;
        if($(this).hasClass("grid-history-active")) return; // no re-attacking same square

		// Add or remove mark on first / second click.
		$(this).find(".missile_hover").hide();
		$(this).toggleClass("grid-missile-fired");
	});

	// Initialize set up prompt. //
	// Set up container.
	var set_up_container = $('<div class="game-modal-container text-center"></div>');

	// Add necessary elements to container.
	set_up_container.append($('<h3>New Game</h3>'));
	set_up_container.append($('<h4>Select Mode</h3>'));
	set_up_container.append($('<div class="btn-group"> \
		<button type="button" class="btn btn-primary new-game-btn waves-effect" data-mode="regular">Classic</button> \
		<button type="button" class="btn btn-danger new-game-btn waves-effect" data-mode="salvo" data-toggle="tooltip" data-placement="top" title="Multiple shots per turn depending on ship count">Salvo</button> \
	</div>'));
	set_up_container.append($('<h3>Join Game</h3>'));
	set_up_container.append($('<div class="btn-group"> \
		<button type="button" class="btn btn-success join-game-btn waves-effect" data-type="first_avail">First Available</button> \
		<button type="button" class="btn btn-default join-game-btn waves-effect" data-type="by_game_id">By Game ID</button> \
	</div>'));

	// Install set up container.
	set_up_container.appendTo($('#newGameModal'));

	// Install click handlers for new game buttons.
    var ai_threshold_minutes = 1.5; // threshold in minutes to play against an Al
	$('.new-game-btn').click(function() {
		var mode = $(this).data("mode");

		// Generate database entry.
		var state = store.getState();
		var user_info = state["user_info"];
		var timestamp = Date.now();
		var entry = {
			users: [
				[user_info.uid, user_info.displayName, user_info.photoURL]
			],
			mode: mode,
			user_states: ["SETUP_PENDING"],
			board_state: [],
			update_timestamp: timestamp,
			started: 0
		};

		// Generate database insertion query.
		var newPostKey = firebase.database().ref().child('games').push().key;
		entry["id"] = newPostKey;
		var updates = {};
        updates['/games/' + newPostKey] = entry;

		// Execute database insertion.
        console.log(firebase.database().ref().update(updates));

		// Save current state.
		store.dispatch({
			type: "UPDATE_GAME_STATE",
			data: {
				"client": false,
				"mode": mode,
				"entry_key": newPostKey,
				"board_state": [],
				"user_states": entry.user_states,
				"update_timestamp": timestamp,
				"started": entry.started
			}
		});

		// Set up searching modal.
		$('#progressModal').find('.progress-modal-header').text("Waiting for an opponent...")
		$('#progressModal').find('.progress-modal-code').show();
		$('#progressModal').find('.progress-modal-subheader').show();
		$('#progressModal').find('.progress-modal-code').text(newPostKey);

		// Fade out new game modal, fade in searching modal.
		$('#newGameModal').hide();
		$('#progressModal').show();
		addStatusEntry("Waiting for an opponent...");

		// Subscribe to game database changes.
		gameRef = db.ref("games/" + newPostKey);
		var hasStarted = 0;
		var onGameDataChange = function(changed_data){
			console.log(changed_data.getKey());
			if(changed_data.getKey() !== "started") return; // don't waste bandwidth
			gameRef.once("value", function(data) {
				// Get current game state.
				var game_state = store.getState().game_state;

				// See if there are any changes.
				data = data.val();
				console.log("Update", data);

				// Update store as necessary.
				var new_state = {
					"client": game_state.client,
					"mode": data.mode,
					"entry_key": game_state.entry_key,
					"board_state": data.board_state,
					"user_states": data.user_states,
					"update_timestamp": data.update_timestamp,
					"started": data.started
				};
				if(data.started == 1 && !hasStarted){
					hasStarted = 1;
					console.log("Game started! Yay!");
					console.log(data.users[1]);

					// Update interface as necessary.
					updateUserAreas(data.users);
					$('#progressModal').find('.progress-modal-header').text("Opponent joined, initializing...");

					// Send an ACK to the joined player.
					var updates = {};
					updates['started'] = 2;
					gameRef.update(updates);
				} else if(data.started == 3 && hasStarted == 1){
					hasStarted = 2;

					// Update interface as necessary.
					$('#progressModal').fadeOut();
					$('.radar-img').removeClass("hidden");
					addStatusEntry("Found an opponent!");

					// Detach this callback and defer to main callback.
					gameRef.off("child_added", onGameDataChange);
					gameRef.off("child_changed", onGameDataChange);
					gameRef.on("child_added", masterGameHandler);
					gameRef.on("child_changed", masterGameHandler);

					// Inform opponent we are starting setup.
					var updates = {};
					updates["user_states/0"] = "DOING_SETUP";
					gameRef.update(updates);
				}
				store.dispatch({type: "UPDATE_GAME_STATE", data: new_state});
			});
		}
		gameRef.on("child_added", onGameDataChange);
		gameRef.on("child_changed", onGameDataChange);
		var interval_timer = undefined, search_start_time = Date.now();
		var updateTimestamp = function() {
			if(hasStarted > 0){
				clearInterval(interval_timer);
                return;
			}
			var updates = {};
			updates['update_timestamp'] = Date.now();
			gameRef.update(updates);

            // Fallback to an Al if time exceeds threshold.
            var elapsed_search_time = (Date.now() - search_start_time) / (60.0 * 1000.0); // in minutes
            if(elapsed_search_time >= ai_threshold_minutes || true){
                setTimeout(function() {
                    startGameAi(/*hosting=*/true, {
                        "id": newPostKey
                    });
                }, 10);
                clearInterval(interval_timer);
                return;
            }
		}
		interval_timer = setInterval(updateTimestamp, 10000); // update timestamp every 10 seconds
        updateTimestamp();
	});

	// Install click handlers for join game buttons.
	$('.join-game-btn').click(function() {
		var type = $(this).data("type");

		// Prompt for game id.
		if(type == "by_game_id"){
            // TODO
            alert("Not implemented yet - sorry!");
			// ...
			return;
		}

		// Set up searching modal.
		$('#progressModal').find('.progress-modal-header').text("Searching for an opponent...")
		$('#progressModal').find('.progress-modal-code').hide();
		$('#progressModal').find('.progress-modal-subheader').hide();

		// Fade out new game modal, fade in searching modal.
		$('#newGameModal').hide();
		$('#progressModal').show();
		addStatusEntry("Searching for an opponent...");

		// Fetch logged-in user state.
		var user_info = store.getState().user_info;

		// Search database in a background thread.
		var canSearch = true, searchComplete = false;
		setTimeout(function() {
			// Obtain a reference.
			var ref = db.ref();

			// Search current games.
			var threshold_minutes = .5; // max age = 30 seconds (since updated every 10 seconds)
			var searchCurrentGames = function(snapshot){
				if(!canSearch || searchComplete) return;
				var on = snapshot.val();
				//console.log(snapshot.val().update_timestamp);
				//console.log(snapshot);
				//console.log(snapshot.val());
				console.log(on);
				if(on.started) return;
				if(on.users[0][0] == user_info.uid) return; // can't join your own game

				// Filter by timestamp.
				var last_updated = on.update_timestamp;
				var diff = (Date.now() - last_updated) / 1000;
				console.log(on, diff);
				if(diff < 60 * threshold_minutes){
					// Mark search as complete.
					console.log("Found joinable game", on);
					searchComplete = true;
					ref.off("child_added", searchCurrentGames);
					//ref.off("child_changed", searchCurrentGames);

					// Join game in background thread.
					setTimeout(function() {
						// Update user interface.
						$('#progressModal').find('.progress-modal-header').text("Found game, joining...");
						$('#progressModal').find('.progress-modal-code').show();
						$('#progressModal').find('.progress-modal-subheader').show();
						$('#progressModal').find('.progress-modal-code').text(on.id);

						// Update database entry object.
						on.started = 1;
						on.users.push([user_info.uid, user_info.displayName, user_info.photoURL]);
						on.user_states.push("SETUP_PENDING");
						on.update_timestamp = Date.now();
						on.board_state = [];

						// Update database with new entry to reflect joining of game.
						// TODO: Security rules so no one except joined users can write
						// if game has started but all auth users can read/spectate.
						var updates = {};
						updates["/games/" + on.id] = on;
						ref.update(updates);

						// Save current state.
						store.dispatch({
							type: "UPDATE_GAME_STATE",
							data: {
								"client": true,
								"mode": on.mode,
								"entry_key": on.id,
								"board_state": [],
								"user_states": on.user_states,
								"update_timestamp": on.update_timestamp,
								"started": on.started
							}
						});

						// Update user areas.
						updateUserAreas(on.users);

						// Listen for changes.
						gameRef = db.ref("games/" + on.id.toString());
						var hasAcked = false;
						var game_id = on.id;
						var onGameDataChange = function(changed_data){
							if(changed_data.getKey() !== "started") return;
							gameRef.once("value", function(data) {
								// Get current game state.
								var game_state = store.getState().game_state;

								// See if there are any changes.
								data = data.val();
								console.log("Update", data);

								// Update store as necessary.
								var new_state = {
									"client": game_state.client,
									"mode": data.mode,
									"entry_key": game_state.entry_key,
									"board_state": data.board_state,
									"user_states": data.user_states,
									"update_timestamp": data.update_timestamp,
									"started": data.started
								};
								if(data.started == 2 && !hasAcked){
									hasAcked = true;
									console.log("Game started with ack! Yay!");
									console.log(data.users[0]);

									// Update interface as necessary.
									$('#progressModal').fadeOut();
									$('.radar-img').removeClass("hidden");
									addStatusEntry("Found an opponent!");

									// Detach this callback and defer to main callback.
									gameRef.off("child_added", onGameDataChange);
									gameRef.off("child_changed", onGameDataChange);
									gameRef.on("child_added", masterGameHandler);
									gameRef.on("child_changed", masterGameHandler);

									// Send a reply ACK.
									var updates = {};
									updates["started"] = 3;
									updates["user_states/1"] = "DOING_SETUP";
									updates["board_state"] = [
										["ht", ["", ""]], // for hit testing
										["his", [[0]]] // for history
									];
									updates["broadcast_action"] = "setup";
									gameRef.update(updates);
								}
								store.dispatch({type: "UPDATE_GAME_STATE", data: new_state});
							});
						}
						gameRef.on("child_added", onGameDataChange);
						gameRef.on("child_changed", onGameDataChange);
					}, 10);
				}
			};
			var threshold = Date.now() - 1000 * 60 * threshold_minutes;
			ref.child("games").orderByChild("update_timestamp").startAt(threshold).on("child_added", searchCurrentGames);
			//ref.child("games").orderByChild("update_timestamp").startAt(threshold).on("child_changed", searchCurrentGames);

            // Fallback to an Al if time exceeds threshold.
            ai_threshold_minutes = 0.001;
            setTimeout(function() {
                if(!searchComplete){
                    startGameAi(/*hosting=*/false, {
                        //
                    });
                }
            }, (ai_threshold_minutes * 60 * 1000));

			/*
			// TODO
			// Subscribe to game changes.
			var handleGameChange = function(data){
				if(!canSearch || searchComplete) return;
				// data is child
				// ...
				//ref.child("games").off("child_added", handleGameChange);
			}
			ref.child("games").orderByChild("update_timestamp").on("child_added", handleGameChange);
			*/
		}, 20);
	});

	// Initialize sign in prompt. //
	// Set up container.
	var sign_in_container = $('<div class="game-modal-container text-center"></div>');

	// Add necessary elements to container.
	sign_in_container.append($('<h3>Sign In</h3>'));
	sign_in_container.append($('<div id="firebaseui-auth-container"></div>'));

	// Install sign in container.
	sign_in_container.appendTo($('#signInModal'));

	// Initialize sign in container.
	var ui = new firebaseui.auth.AuthUI(firebase.auth());
	ui.start('#firebaseui-auth-container', {
		signInSuccessUrl: '/',
		signInOptions: [
			firebase.auth.GoogleAuthProvider.PROVIDER_ID,
			firebase.auth.GithubAuthProvider.PROVIDER_ID
		],
		tosUrl: ''
	});

	// Install authentication handler.
	var isLoggedIn = undefined;
	firebase.auth().onAuthStateChanged(function(user) {
		if(user){
			if(isLoggedIn === true) return; // timeout occurred
			isLoggedIn = true;
			var displayName = user.displayName;
            var email = user.email;
            var emailVerified = user.emailVerified;
            var photoURL = user.photoURL;
            var uid = user.uid;
            var providerData = user.providerData;
            user.getToken().then(function(accessToken) {
            	var user_info = {
					displayName: displayName,
					email: email,
					emailVerified: emailVerified,
					photoURL: photoURL,
					uid: uid,
					accessToken: accessToken,
					providerData: providerData
                };
				store.dispatch({ type: 'STORE_USER_INFO', data: user_info })

                // Fill in account info.
                var account_box = $('.account-info-box');
                account_box.find('.media-object').attr('src', photoURL);
                account_box.find('.media-heading').text(displayName);

				// Install sign out handler.
				account_box.find('.sign-out-btn').first().click(function() {
					setTimeout(function() {
						firebase.auth().signOut();
					}, 20);
				});

				// Add status entry.
				var name_arr = displayName.split(" ");
				if(name_arr.length > 1){
					addStatusEntry("Welcome back, " + name_arr[0] + "!");
				}

				// Hide other modals.
				$('.game-modal').hide();

                // Display account area.
                $('#account_area').show();

                // Prompt user for game type.
				$('#newGameModal').fadeIn();
            });
        } else {
			isLoggedIn = false;

			// Hide other modals and login-only areas.
        	$('#account_area').hide();
			$('.game-modal').hide();

			// Add initial status entry.
			addStatusEntry("Welcome to Battleboat! Please sign in to start playing.");

			// Display sign in modal.
			$('#signInModal').fadeIn();
        }
    });

	// Initialize tooltips. //
	$(function () {
		$('[data-toggle="tooltip"]').tooltip()
	});

	// Set up modal dismiss buttons. //
	$('#dialogModal').find('.btn').click(function() {
		$('#dialogModal').fadeOut();
	});
    $('#gameResultModal').find('.btn').click(function() {
        //$('#gameResultModal').fadeOut();
        window.location.reload();
    });

	/* //
	setTimeout(function() {
		$('.game-modal').fadeOut();
		startGame();
	}, 500);
	// */
});

$(window).on("resize", function() {
	// Display warning.
	$('#warningModal').find('.warning-modal-header').text("Do not resize");
	$('#warningModal').find('.warning-modal-subheader').text("Resizing the window after the interface has loaded causes graphics glitches. Please refresh the page.");
	$('#warningModal').fadeIn();
});

































