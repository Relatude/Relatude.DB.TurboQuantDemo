using Relatude.DB.Datamodels;
using Relatude.DB.Demo.Models;
using Relatude.DB.NodeServer;
using Relatude.DB.Query;

var idFlat = Guid.Parse("abc5f1b0-2833-4b33-9917-d3b0b5a17539");
var idTurbo = Guid.Parse("8cf01945-f15c-4b8e-af52-711c656d14cb");
var builder = WebApplication.CreateBuilder(args);
builder.AddRelatudeDB(); // Add RelatudeDB services to the application

var app = builder.Build();
app.UseHttpsRedirection();
app.UseRelatudeDB(); // Use RelatudeDB middleware to handle database operations
app.UseDefaultFiles();
app.UseStaticFiles();
object lockObj = new();
app.MapPost("search", async (Query q, RelatudeDBContext ctx) => {
    lock (lockObj) { // force only one search at a time to get more accurate timing results
        if (q.Iterations < 1) throw new ArgumentException("Iterations must be at least 1.");
        var db = ctx.Server.GetStore(q.UseTurboQuant ? idTurbo : idFlat);
        long indexSizeIn = db.Datastore.IO.GetFiles()
        .Where(f => f.Key.Contains(NodeConstants.SystemVectorIndexPropertyId.ToString()))
        .Sum(f => db.Datastore.IO.GetFileSizeOrZeroIfUnknown(f.Key));
        ResultSetSearch<DemoArticle>? resultSet = null;
        var innerDurationMs = 0d;
        for (int i = 0; i < q.Iterations; i++) {
            resultSet = db.Query<DemoArticle>()
            .Search(q.Terms, q.SemanticRatio, q.MinimumCosineSimilarity, null, null, 100000)
            .Page(0, 20)
            .Execute();
            innerDurationMs += resultSet.InnerDurationMs;
        }
        if (resultSet == null) throw new NullReferenceException();
        return new Result {
            Hits = resultSet.Values.Select(hit => new Hit {
                Title = hit.Node.Title,
                Body = hit.Node.Content,
            }).ToArray() ?? [],
            DurationPerIterationMs = innerDurationMs / q.Iterations,
            TotalHits = resultSet.TotalCount,
            IndexSizeMb = (int)(indexSizeIn / (1024 * 1024))
        };
    }
});
app.Run();

// Model classes:
public class Query {
    public string Terms { get; set; } = string.Empty;
    public bool UseTurboQuant { get; set; }
    public int Iterations { get; set; }
    public double SemanticRatio { get; set; }
    public float MinimumCosineSimilarity { get; set; }
}
public class Result {
    public Hit[] Hits { get; set; } = [];
    public int TotalHits { get; set; }
    public int IndexSizeMb { get; set; }
    public double DurationPerIterationMs { get; set; }
}
public class Hit {
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
}
