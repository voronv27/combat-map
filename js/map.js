// JS code for the combat map page (index.html)

/* CODE FOR MAP CONTAINER IMAGE FITTING */
const mapBg = document.getElementById("mapBg");
const mapCtr = document.getElementById("mapCtr");
var zoom = 1;
var minZoom = 1;
async function fitImg() {
    const imgRatio = mapBg.naturalWidth / mapBg.naturalHeight;
    const ctrRatio = mapCtr.clientWidth / mapCtr.clientHeight;
    
    // for a very small difference in ratio, don't change
    // (prevents some flickering)
    const eps = 0.01;
    if (Math.abs(imgRatio - ctrRatio) < eps) {
        return;
    }
    
    if (imgRatio > ctrRatio) {
        // scale by height, let width overflow
        mapBg.classList.remove("sm:w-full", "sm:h-auto");
        mapBg.classList.add("sm:h-full", "sm:w-auto");

        // update minZoom
        const renderedWidth = mapBg.clientWidth;
        minZoom = mapCtr.clientWidth / renderedWidth;
        
        // update zoom if too zoomed out now
        if (zoom < minZoom) {
            zoom = minZoom;
            mapBg.style.transform = `scale(${zoom})`;
        }
    } else {
        // scale by width, let height overflow
        mapBg.classList.remove("sm:h-full", "sm:w-auto");
        mapBg.classList.add("sm:w-full", "sm:h-auto");

        // update minZoom
        const renderedHeight = mapBg.clientHeight;
        minZoom = mapCtr.clientHeight / renderedHeight;
        
        // update zoom if too zoomed out now
        if (zoom < minZoom) {
            zoom = minZoom;
            mapBg.style.transform = `scale(${zoom})`;
        }
    }
}

// Upon new image upload, fit img to container, reset zoom
mapBg.onload = () => {
    fitImg();
    mapBg.style.transform = "scale(1)";
    zoom = 1;
}

// we need to calculate minZoom when the image is rendered
// (i.e. roomContent is no longer hidden)
const roomContent = document.getElementById("roomContent");
function mutationBehavior(_, observer) {
    if (roomContent.checkVisibility()) {
        fitImg();
        zoom = 1;
        mapBg.style.transform = "scale(1)";
        observer.disconnect();
    }
}
// observe the style and class attributes to see when no
// longer hidden
const observerOptions = {
    attributes: true,
    attributeFilter: ['style', 'class']
};
const observer = new MutationObserver(mutationBehavior);
observer.observe(roomContent, observerOptions);

// Upon container resize (due to page resize), refit img
const resizeObserver = new ResizeObserver(fitImg);
resizeObserver.observe(mapCtr);

/* CODE FOR SHOWING PAN CONTROLS MESSAGE */
const msgCtr = document.getElementById("ctrlMsgCtr");
msgCtr.style.opacity = "1";
function hideMsg() {
    msgCtr.style.opacity = "0";
    mapCtr.removeEventListener("wheel", hideMsg);
    mapCtr.removeEventListener("mousedown", hideMsg);
    mapCtr.removeEventListener("pointerdown", hideMsg);
}
mapCtr.addEventListener("pointerdown", hideMsg, {once:true});
mapCtr.addEventListener("wheel", hideMsg, {once:true});
mapCtr.addEventListener("mousedown", hideMsg, {once:true})

/* CODE FOR MAP CONTAINER PAN */
// TODO: update cursor style when in pan mode
//mapCtr.style.cursor = "TODO";

// enable/disable pan
// TODO: actually use this function (when we implement swapping modes)
var panMode = true;
function setPanMode(enabled) {
    panMode = enabled;
    if (enabled) {
        // TODO: update cursor style when in pan mode
        //mapCtr.style.cursor = "TODO";
    } else {
        mapCtr.style.cursor = "default";
    }
}

// click-drag
var click = false;
var mouseX, mouseY;
function startDrag(e) {
    if (!panMode) return;

    // on click, record x and y and set click to true
    click = true;
    mouseX = e.clientX + mapCtr.scrollLeft;
    mouseY = e.clientY + mapCtr.scrollTop;

    // TODO: update cursor style when click-dragging
    //mapCtr.style.cursor = "TODO";
}

mapCtr.addEventListener("mousedown", (e) => {
    startDrag(e);
});

// use window instead of container to continue dragging
// if mouse leaves container
function duringDrag(e) {
    if (!panMode) return;
    if (!click) return;

    // on click, record x and y and set click to true
    mapCtr.scrollLeft = mouseX - e.clientX;
    mapCtr.scrollTop = mouseY - e.clientY;
}
window.addEventListener("mousemove", (e) => {
    duringDrag(e);
});

function endDrag() {
    click = false;
    // TODO: update cursor style when done click-dragging
    //mapCtr.style.cursor = "TODO";
}
window.addEventListener("mouseup", () => {
    endDrag();
});
window.addEventListener("mouseleave", () => {
    endDrag();
});

// zoom
function mapZoom(e, pinch=false) {
    if (!panMode) return;

    // must be holding shift or using pinch to zoom
    if (!e.shiftKey && !pinch) return;
    e.preventDefault();

    // get the change in zoom   
    var change = 0;
    if (pinch) {
        // update finger that has moved
        const index = fingersDown.findIndex(
            (f) => f.pointerId == e.pointerId
        );
        fingersDown[index] = e;

        if (fingersDown.length == 2) {
            const newPinchDiff = Math.hypot(
                fingersDown[0].clientX - fingersDown[1].clientX,
                fingersDown[0].clientY - fingersDown[1].clientY
            );

            if (pinchDiff > 0) {
                change = (newPinchDiff - pinchDiff) * 0.01;
            }
            pinchDiff = newPinchDiff;
        }
    } else {
        change = -e.deltaY * 0.001;
    }
    // bound zoom--can't zoom out past how the image is originally fitted
    const newZoom = Math.max(minZoom, zoom + change);

    if (newZoom == zoom) return;

    // zoom relative to cursor position
    const rect = mapCtr.getBoundingClientRect();
    const offsetX = e.clientX - rect.left + mapCtr.scrollLeft;
    const offsetY = e.clientY - rect.top + mapCtr.scrollTop;
    const scale = newZoom / zoom;

    mapCtr.scrollLeft = offsetX * scale - (e.clientX - rect.left);
    mapCtr.scrollTop = offsetY * scale - (e.clientY - rect.top);

    zoom = newZoom;
    mapBg.style.transform = `scale(${zoom})`;
    mapBg.style.transformOrigin = "left top";
}
mapCtr.addEventListener("wheel", (e) => {
    mapZoom(e);
}, {passive: false});

// touchscreen (pinch to zoom)
const fingersDown = [];
var pinchDiff = -1;
function fingerUp(e) {
    const index = fingersDown.findIndex(
        (f) => f.pointerId == e.pointerId
    );
    fingersDown.splice(index, 1);
    if (fingersDown.length < 2) {
        pinchDiff = -1;
    }
}
mapCtr.addEventListener("pointerdown", (e) => {
    fingersDown.push(e);
});
mapCtr.addEventListener("pointermove", (e) => {
    mapZoom(e, pinch=true);
}, {passive: false});
mapCtr.addEventListener("pointerup", (e) => {
    fingerUp(e);
});
mapCtr.addEventListener("pointercancel", (e) => {
    fingerUp(e);
});
mapCtr.addEventListener("pointerout", (e) => {
    fingerUp(e);
});
mapCtr.addEventListener("pointerleave", (e) => {
    fingerUp(e);
});

/* CODE FOR SWAPPING NOTES TABS */
const tabs = [
    document.getElementById("initiative-tab"),
    document.getElementById("conditions-tab"),
    document.getElementById("notes-tab")
]
const tabConts = [
    document.getElementById("initiative"),
    document.getElementById("conditions"),
    document.getElementById("notes")
]
function swapTab(tab) {
    for (let t of tabConts) {
        t.classList.add("hidden");
    }
    for (let t of tabs) {
        t.classList.remove("bg-dark", "text-light-accent");
    }
    const activeTabCont = document.getElementById(tab);
    activeTabCont.classList.remove("hidden");

    const activeTab = document.getElementById(`${tab}-tab`);
    activeTab.classList.add("bg-dark", "text-light-accent");
}

/* CODE TO ADD/REMOVE NOTES */
// add a new note
function addNewNote() {
    // make a copy of the desired textbox but with no text
    const tab = document.getElementById("notes");
    const exampleTextbox = tab.firstElementChild;
    const newTextbox = exampleTextbox.cloneNode(true);
    const textarea = newTextbox.children[0];
    textarea.value = "";

    // append item at bottom just above the button
    const btn = tab.lastElementChild;
    tab.insertBefore(newTextbox, btn);
}

// remove note unless there is only 1 left, then 
// clear the textarea instead
function removeNote(note) {
    // make a copy of the desired textbox but with no text
    const tab = document.getElementById("notes");
    const children = tab.children;
    
    // check if we only have 1 item + the add button
    if (children.length > 2) {
        note.remove();
    } else {
        const textarea = note.children[0];
        textarea.value = "";
    }
}