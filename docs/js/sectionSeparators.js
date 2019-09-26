// Replaces all instances of the section-sep tag with a small,
// centered 5% opacity Synthetix logo with some top margin.
//const separator = '<img src="../../img/logos/synthetix_logo_light.png">'
const separator = '';
const separators = document.getElementsByTagName('section-sep');
for (let sep of separators) {
    sep.innerHTML = separator;
}