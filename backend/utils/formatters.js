const formatKES  = (n) => `KSh ${Number(n).toLocaleString('en-KE')}`;
const formatDate = (d) => new Date(d).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'});
const maskPhone  = (p) => (p||'').replace(/(\d{3})\d{5}(\d{3})/,'$1*****$2');
const truncate   = (s, n=80) => s && s.length > n ? s.slice(0,n)+'…' : s;
module.exports = { formatKES, formatDate, maskPhone, truncate };
