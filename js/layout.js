// JS code that is not being shared by the server (notes, screen layout, etc)

/* CODE FOR DROPDOWN MENU (on mobile) */
const dropdownMenu = document.getElementById("header-dropdown");
const dropdownMenuOpenBtn = document.getElementById("header-dropdown-open");
const dropdownMenuCloseBtn = document.getElementById("header-dropdown-close");
function openHeaderDropdown() {
    dropdownMenu.classList.remove("hidden");
    dropdownMenuOpenBtn.classList.add("hidden");
    dropdownMenuCloseBtn.classList.remove("hidden");
}

function closeHeaderDropdown() {
    dropdownMenu.classList.add("hidden");
    dropdownMenuOpenBtn.classList.remove("hidden");
    dropdownMenuCloseBtn.classList.add("hidden");
}

// Clicking outside of the header closes the dropdown menu
const header = document.getElementById("header");
document.addEventListener("click", (e) => {
    if (!header.contains(e.target)) {
        closeHeaderDropdown();
    }
});

/* ANIMATE EATING THE ROOM CODE */
const mouth = document.getElementById("roomId");
const fang = document.getElementById("fang");
async function eatCode() {
    // skip animation for invalid room id
    const roomId = document.getElementById("roomId").value;
    if (!roomId) {
        return;
    }
    fang.classList.add("fang-animation");
    mouth.classList.add("mouth-animation");
    await new Promise(resolve => {
        fang.addEventListener('animationend', resolve, {once: true})
    });
    mouth.classList.remove("mouth-animation");
    fang.classList.remove("fang-animation");
}

/* CODE FOR MAP CONTAINER IMAGE FITTING */
const mapBg = document.getElementById("mapBg");
const mapCtr = document.getElementById("mapCtr");
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
        mapBg.classList.add("sm:h-full", "sm:w-auto")
    } else {
        // scale by width, let height overflow
        mapBg.classList.remove("sm:h-full", "sm:w-auto");
        mapBg.classList.add("sm:w-full", "sm:h-auto");
    }
}

// Upon new image upload, fit img to container, reset zoom
var zoom = 1;
var minZoom = 1;
mapBg.onload = () => {
    fitImg();
    mapBg.style.transform = "scale(1)";
    zoom = 1;
}

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
    mapBg.style.transformOrigin = "top left";
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



