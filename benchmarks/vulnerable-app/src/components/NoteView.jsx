export function NoteView({ note }) {
  return (
    <article className="note">
      <h2>{note.title}</h2>
      <div dangerouslySetInnerHTML={{ __html: note.body }} />
    </article>
  );
}
