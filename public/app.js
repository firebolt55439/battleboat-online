// TODO: Salvo and normal variants.
// TODO: Play AI if no opponent found in n minutes
// TODO: Turn-based action and animations (when receiving opponent's moves, show
// nice uppercase typewriter red text saying your/their turn and an animated missile
// svg animation for what they fire)
// TODO: Your ships (w/ svg images) on right and n squares side-by-side with filled in
// with x's or in red if hit with n = ship length and put ship name and label there as well
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
	var store_handler = function(state = initialState, action){
		var type = action.type;
		if(type === "STORE_USER_INFO"){
			var ret = jQuery.extend({}, state);
			ret["user_info"] = action.data;
			return ret;
		} else if(type === "UPDATE_GAME_STATE"){
			var ret = jQuery.extend({}, state);
			ret["game_state"] = action.data;
			return ret;
		} else if(type === "SET_HIT_STRING"){
			var ret = jQuery.extend({}, state);
			ret["hit_string"] = action.data;
			return ret;
		} else if(type === "UPDATE_THEIR_FIRED_SQUARES"){
            var ret = jQuery.extend({}, state);
            Array.prototype.push.apply(ret["their_fired"], action.data);
			return ret;
        } else if(type === "UPDATE_OUR_FIRED_SQUARES"){
            var ret = jQuery.extend({}, state);
            Array.prototype.push.apply(ret["our_fired"], action.data);
			return ret;
        }
	}
	var store = Redux.createStore(store_handler);

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
					console.log(x, y);

					// Update element transform style.
					event.target.style.webkitTransform = event.target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';

					// Update covered squares.
					updateCovered();
				})
				.on("tap", function(event) {
					// Swap width and height;
					var origHeight = event.target.style.height;
					var origWidth = event.target.style.width;
					event.target.style.height = origWidth;
					event.target.style.width = origHeight;

					// Update covered squares.
					updateCovered();
				});

			// Initial covered update.
			updateCovered();
		})();
	}
	// Define ship setup helper function.
	var all_ships = [
		["Carrier", 5],
		["Battleship", 4],
		["Cruiser", 3],
		["Submarine", 3],
		["Destroyer", 2]
	];
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
			store.dispatch({ type: "SET_HIT_STRING", data: hit_str })
		});
		$('.finish-setup-button').fadeIn();
	}
    var startTurnPrompt = function() {
        $('#dialogModal').find('.dialog-modal-header').text("Your Turn");
        $('#dialogModal').find('.dialog-modal-subheader').text("It is now your turn to fire at your opponent. Choose wisely!");
        $('#dialogModal').fadeIn();
    }
    var enableGridHover = function() {
        // Enable hover and click effects.
        setup_complete = true;
        $('.grid-square').each(function() {
			$(this).removeClass("waiting-for-setup");
		});

        // Fill in board for our hits and misses.
        var cur_state = store.getState();
        var our_fired = cur_state.our_fired;
        console.log("Our fired", our_fired);
        for(var i = 0; i < our_fired.length; i++){
            var on = our_fired[i];
            var on_sq = on.square;
            console.log("History add", on);
            var grid_id = 'grid-' + on_sq[0].toString() + '-' + on_sq[1].toString();
            $('#' + grid_id).addClass("grid-history-active");
            if(on.hit){
                $('#' + grid_id).addClass("grid-history-hit");
            } else {
                $('#' + grid_id).addClass("grid-history-miss");
            }
        }
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
			}
			// TODO: Salvo support

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
		// TODO: Vary instructions by mode
		$('#dialogModal').find('.dialog-modal-header').text("Gameplay Instructions");
		$('#dialogModal').find('.dialog-modal-subheader').text("Click once on a square to mark it as a guess, and again to clear it. Once you have made your decision, click 'Fire' to dispatch your missiles.");
		$('#dialogModal').fadeIn();
	}

	// Define main game event handler.
	var interesting_keys = ["turn_end_key", "broadcast_action"];
	var masterGameHandler = function(changed_data){
		// Check if the event is interesting (e.g. worth a database fetch).
		var key = changed_data.getKey();
		if(interesting_keys.indexOf(key) === -1) return;
		console.log(key);

		// Handle special keys.
		var setup_check = false;
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
                    $('#gameResultModal').find('.game-result-modal-header').text("You Lose.");
                    $('#gameResultModal').find('.game-result-modal-subheader').text("Your opponent won. Avenge yourself!");
                    $('#gameResultModal').fadeIn();
                    return;
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
                                    $('#' + grid_id)
                                        .addClass("grid-animating")
                                        .addClass("grid-animation-ship-residing")
                                    ;
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
                            uniqueHits = uniqueHits.filter(function(el, i, arr){
                                return arr.indexOf(el) === i;
                            });
                            var our_total_successful_hits = uniqueHits.length;
                            var winning_hit_num = all_ships.reduce(function(a, b){
                                return a + b[1];
                            });
                            if(our_total_successful_hits === winning_hit_num){
                                $('#gameResultModal').find('.game-result-modal-header').text("You Win!");
                                $('#gameResultModal').find('.game-result-modal-subheader').text("Congratulations, you won!");
                                $('#gameResultModal').fadeIn();
                                var updates = {};
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

			// Handle data changes and update interface accordingly.
			// TODO: Update board state, deal with synchronization, etc.
			// ...
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
	var svg_missile_hover = '<svg class="missile_hover grid-image" style="display: none;" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"	 viewBox="0 0 25.979 25.979" style="enable-background:new 0 0 25.979 25.979;" xml:space="preserve"><g>	<path  d="M25.744,6.604C26.08,6.267,26.107,6.02,25.48,6.02c-0.628,0-4.556,0-5.068,0		c-0.512,0-0.533,0.016-0.814,0.297c-0.281,0.281-4.604,4.607-4.604,4.607s5.413,0,5.877,0c0.465,0,0.633-0.037,0.912-0.318		C22.063,10.326,25.408,6.94,25.744,6.604z"/>	<path  d="M19.375,0.235c0.336-0.335,0.584-0.363,0.584,0.264s0,4.555,0,5.067S19.943,6.1,19.662,6.381		s-4.607,4.604-4.607,4.604s0-5.414,0-5.878c0-0.464,0.037-0.632,0.318-0.912C15.653,3.916,19.039,0.571,19.375,0.235z"/>	<path  d="M1.621,16.53c-2.161,2.162-2.162,5.666-0.001,7.828c2.161,2.161,5.667,2.161,7.828,0		c0.93-0.931,6.001-6,6.931-6.93c2.161-2.161,2.161-5.666,0-7.829c-2.162-2.162-5.666-2.161-7.828,0		C7.621,10.531,2.551,15.6,1.621,16.53z"/></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g></svg>';
	var svg_missile_fired = '<svg class="missile_fired grid-image" style="display: none;" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"	 width="459.615px" height="459.614px" viewBox="0 0 459.615 459.614" style="enable-background:new 0 0 459.615 459.614;"	 xml:space="preserve"><g>	<path d="M455.456,249.343l-13.932,3.993v53.451h-40.142l-30.042-37.909h-68.935v50.638c0,6.752-2.573,12.224-5.734,12.224		l-78.506-62.856H101.073c-1.374,0-2.733-0.027-4.09-0.05v-78.049c1.357-0.022,2.717-0.047,4.09-0.047h121.717l73.873-62.862		c3.169,0,5.729,5.475,5.729,12.238v50.624h64.635l34.354-43.598h40.142v59.82l13.927,4.169		C464.818,230.934,455.456,249.343,455.456,249.343z M0,229.808c0,19.485,34.821,35.634,80.359,38.594v-77.169		C34.827,194.19,0,210.327,0,229.808z"/></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g></svg>';

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

		// TODO: Network, etc.
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
		var interval_timer = undefined;
		var updateTimestamp = function() {
			if(hasStarted > 0){
				clearInterval(interval_timer);
			}
			var updates = {};
			updates['update_timestamp'] = Date.now();
			gameRef.update(updates);
		}
		interval_timer = setInterval(updateTimestamp, 10000); // update timestamp every 10 seconds
	});

	// Install click handlers for join game buttons.
	$('.join-game-btn').click(function() {
		var type = $(this).data("type");

		// Prompt for game id.
		if(type == "by_game_id"){
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
					// ...
				}

				// ...
			};
			var threshold = Date.now() - 1000 * 60 * threshold_minutes;
			ref.child("games").orderByChild("update_timestamp").startAt(threshold).on("child_added", searchCurrentGames);
			//ref.child("games").orderByChild("update_timestamp").startAt(threshold).on("child_changed", searchCurrentGames);

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

































