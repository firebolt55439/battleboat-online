// TODO: Salvo and normal variants.
// TODO: Play AI if no opponent found in n minutes
var setup_complete = false;

$(document).ready(function() {
	// Create a redux store.
	var store_handler = function(state = {}, action){
		var type = action.type;
		if(type == "STORE_USER_INFO"){
			var ret = jQuery.extend({}, state);
			ret["user_info"] = action.data;
			return ret;
		} else if(type == "UPDATE_GAME_STATE"){
			var ret = jQuery.extend({}, state);
			ret["game_state"] = action.data;
			return ret;
		}
	}
	var store = Redux.createStore(store_handler);

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
			<div class="media-left ' + hidden + '"> \
				<img class="media-object image-resize-to-fit img-circle" src="" alt="Account photo"></img> \
			</div> \
			<div class="media-body"> \
				<h4 class="media-heading cyan-blue">User Name</h4> \
				<p class="media-text"></p> \
			</div> \
		</div>'));
		/*
		<div class="media">
		<div class="media-body">
			<h4 class="media-heading">Media heading</h4>
		</div>
		<div class="media-right"></div>
		</div>
		*/
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
		$('.user-area-left').find('.media-heading').text(them[1]);
		$('.user-area-left').find('.media-text').text(client_text[+ !are_we_client]); // unary + operator casts bool to int
		$('.user-area-left').find('.media-object').attr('src', them[2]);
		$('.user-area-right').find('.media-heading').text(us[1]);
		$('.user-area-right').find('.media-text').text(client_text[+ are_we_client]);
		$('.user-area-right').find('.media-object').attr('src', us[2]);

		// Display interface changes.
		$('#versusText').fadeIn();
		$('.user-info-box').fadeIn();
	}

	// Set up the 10x10 game grid. //
	// Set up the container.
	var game_container = $('<div class="fluid-container grid-container"></div>');

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
			var elem = $('<div class="col-md-1 col-xs-1 grid-square">' + svg_missile_hover + svg_missile_fired + '</div>');
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
	$('.grid-square').hover(function() {
		if(!setup_complete) return;
		if($(this).hasClass("grid-missile-fired")) return;
		$(this).find(".missile_hover").show();
	}, function() {
		$(this).find(".missile_hover").hide();
	});

	// Disable hover effects until game is setup.
	$('.grid-square').each(function() {
		$(this).addClass("waiting-for-setup");
	});

	// Install click handler for grid squares.
	$('.grid-square').click(function() {
		if(!setup_complete) return;
		$(this).find(".missile_hover").hide();
		$(this).find(".missile_fired").show();
		$(this).addClass("grid-missile-fired");

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
			started: false
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
				"started": false
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
		var gameRef = db.ref("games/" + newPostKey);
		var onGameDataChange = function(changed_data){
			gameRef.once("value", function(data) {
				console.log("Update", data.val());
				if(data.started){
					console.log("Game started! Yay!");
					console.log(data.users[1]);
					updateUserAreas(data.users);
					// ...
				}

				// ...
			});
		}
		gameRef.on("child_added", onGameDataChange);
		gameRef.on("child_changed", onGameDataChange);

		// ... gameRef.off("child_added", onGameDataChange)
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
			var searchCurrentGames = function(snapshot){
				if(!canSearch || searchComplete) return;
				//console.log(snapshot.val().update_timestamp);
				snapshot.forEach(function(child) {
					var on = child.val();
					if(on.started) return;
					if(on.users[0][0] == user_info.uid) return; // can't join our own game

					// Filter by timestamp.
					var last_updated = on.update_timestamp;
					var threshold_minutes = 2.5; // max age
					var diff = (Date.now() - last_updated) / 1000;
					console.log(on, diff);
					if(diff < 60 * threshold_minutes){
						console.log("Found joinable game", on);
						searchComplete = true;
						setTimeout(function() {
							// Update user interface.
							$('#progressModal').find('.progress-modal-header').text("Joining game...");
							$('#progressModal').find('.progress-modal-code').show();
							$('#progressModal').find('.progress-modal-subheader').show();
							$('#progressModal').find('.progress-modal-code').text(on.id);

							// Update database entry object.
							on.started = true;
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
									"started": true
								}
							});

							// Update user areas.
							updateUserAreas(on.users);

							// ...
						}, 10);
						// ...
					}

					// ...
				});
			};
			ref.child("games").orderByChild("update_timestamp").limitToLast(100).once("value", searchCurrentGames);

			// Subscribe to game changes.
			var handleGameChange = function(data){
				if(!canSearch || searchComplete) return;
				// data is child
				// ...
				//ref.child("games").off("child_added", handleGameChange);
			}
			ref.child("games").orderByChild("update_timestamp").on("child_added", handleGameChange);
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

	// Initialize tooltips.
	$(function () {
		$('[data-toggle="tooltip"]').tooltip()
	});
});


































