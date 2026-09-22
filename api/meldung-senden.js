// Ersetzt durch /api/hw (Meldungen werden jetzt in der Datenbank gespeichert und von dort versendet).
// Diese Datei darf im Repository gelöscht werden.
export default function handler(req, res) {
  res.status(410).json({ error: 'Ersetzt durch /api/hw' });
}
