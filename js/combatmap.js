// JS code for the various map-related features on the site, such as loading in images
// or adding elements & drawings

// Add a listener for changes in the combat map image
window.addEventListener( 'load', function() {
    document.getElementById( 'fileInput' ).addEventListener( 'change', function() {
        // Remove previous image
        var mapBg = document.getElementById( 'mapBg' );
        mapBg.onload = () => {
            if ( mapBg.src ) {
                URL.revokeObjectURL( mapBg.src );  // no longer needed, free memory
            }
        }
        if ( !this.files || !this.files[0] ) {
            return;
        }

        // Display new image
        var img = this.files[0];
        mapBg.src = URL.createObjectURL( img ); // create a blob url for the image
    });
});